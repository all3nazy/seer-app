-- «سِير أدمن», stage 3: the platform team's roles, coupons, subscription receipts and invoices,
-- broadcasts to subscribers, login security with an IP block list, the full operations log.
-- 1) Roles: private.platform_admins.role = owner (everything) | support (support threads and reply
--    templates, read-only organization profiles) | finance (transfers, invoices, coupons, read-only
--    organizations). private.platform_role() is the role of the signed-in admin after two-step
--    verification (aal2), private.require_platform_admin(roles) refuses any other role (owner always
--    passes). The existing admin functions keep calling private.require_platform_admin() with no
--    argument; it now looks up which function called it (PG_CONTEXT) in one explicit list below, and
--    anything not in that list is owner-only. Support replies and closing threads need owner/support.
--    Notifications for the team go by role (support → owner+support, transfers → owner+finance).
--    Team: admin_team(), admin_team_invite(email, role) (the account must exist; it must enroll
--    two-step verification at first sign-in, as every admin), admin_team_set_role, admin_team_remove;
--    at least one owner always remains and nobody changes or removes themselves.
-- 2) Coupons: private.coupons (+ the payments that used them). The owner's renewal page asks
--    public.quote_subscription_coupon(org, plan, months, code) for the discounted price; the new
--    6-argument submit_subscription_payment stores coupon, code, base amount and discount on the
--    payment. Uses count pending + approved payments (a rejected one frees its use).
-- 3) Receipts and invoices: public.platform_invoices with one yearly counter (SEER-2026-00001). A
--    receipt is issued when a transfer is approved (trigger; existing approved transfers are numbered
--    now, oldest first); «إصدار فاتورة» issues a manual adjustment. Owners read theirs (RLS).
-- 4) Broadcasts: private.broadcasts + private.broadcast_recipients (one row per broadcast and user,
--    so a double click or a retry never sends twice; the client sends an idempotency key). In-app
--    notification to owners (optionally managers too) and email to owners with real addresses
--    through the existing private.email_outbox queue.
-- 5) Login security: private.ip_blocks (an address or a range, reason, optional expiry), enforced
--    by private.login_check (body copied, the block check added first: scope 'blocked'). Admin page
--    data for 24 hours or 7 days, release a lock, block/unblock an address.
-- 6) Full operations log: admin_audit_log(filters, page) and admin_audit_filters().
-- Every admin function checks the role and aal2, and every change is written to platform_audit.
-- Forward-only.
begin;

-- 1) Roles ---------------------------------------------------------------------------------------------
alter table private.platform_admins add column role text not null default 'owner' check (role in ('owner','support','finance'));
alter table private.platform_admins add column invited_by uuid references auth.users(id) on delete set null;

create function private.platform_role() returns text language sql stable security definer set search_path = '' as $$
 select a.role from private.platform_admins a where a.user_id = auth.uid() and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;
create function private.has_platform_role(roles text[]) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(private.platform_role() = 'owner' or private.platform_role() = any(roles), false)
$$;
create function private.require_platform_admin(roles text[]) returns void language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.has_platform_role(coalesce(roles, '{}')) then raise exception 'Not allowed for this admin role' using errcode = '42501'; end if;
end $$;

-- The roles each existing admin function allows besides the owner. Not listed = owner only.
create or replace function private.require_platform_admin() returns void language plpgsql stable security definer set search_path = '' as $$
declare stack text; caller text;
begin
 if not private.is_platform_admin() then raise exception 'Platform admins only' using errcode = '42501'; end if;
 get diagnostics stack = pg_context;
 -- The first PL/pgSQL frame after this one is the caller (statement lines in between are skipped).
 select (regexp_match(t.line, '^PL/pgSQL function (?:private\.)?([a-z_0-9]+)\('))[1] into caller
 from unnest(string_to_array(stack, chr(10))) with ordinality as t(line, n) where t.line ~ '^PL/pgSQL function ' order by t.n offset 1 limit 1;
 perform private.require_platform_admin(case
  when caller in ('admin_overview','admin_overview_v2','admin_subscribers','admin_subscribers_v2','admin_subscriber','admin_org_profile',
                  'admin_onboarding','telegram_link_code','telegram_status','telegram_unlink') then array['support','finance']
  when caller in ('admin_support_threads','admin_support_templates','admin_save_support_template') then array['support']
  when caller in ('admin_pending_payments','admin_approve_payment','admin_reject_payment') then array['finance']
  else '{}'::text[] end);
end $$;

-- Support replies and closing: the thread's own user, or the owner/support team (body otherwise unchanged).
create or replace function private.reply_support(thread uuid, body text) returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.support_threads%rowtype; message uuid; org_name text;
begin
 select * into t from public.support_threads x where x.id = thread for update;
 if not found or (t.user_id <> auth.uid() and not private.has_platform_role(array['support'])) then raise exception 'Not allowed' using errcode = '42501'; end if;
 if t.status <> 'open' then raise exception 'Thread is closed' using errcode = '22023'; end if;
 if length(btrim(coalesce(body,''))) < 1 then raise exception 'Write a message' using errcode = '22023'; end if;
 perform private.support_rate_check();
 insert into public.support_messages(thread_id, sender_id, from_admin, body) values (thread, auth.uid(), t.user_id <> auth.uid(), left(btrim(body), 2000)) returning id into message;
 update public.support_threads set last_message_at = now(), last_sender = case when t.user_id <> auth.uid() then 'admin' else 'user' end where id = thread;
 if t.user_id <> auth.uid() then
  perform private.notify(t.organization_id, t.user_id, 'support', 'رد من فريق سِير', left(btrim(body), 200), '/dashboard/support/' || thread);
 else
  select o.name into org_name from public.organizations o where o.id = t.organization_id;
  perform private.notify_platform_admins(t.organization_id, 'support', 'رد في تذكرة: ' || coalesce(org_name, 'منشأة'), left(btrim(body), 200), '/admin/support/' || thread);
 end if;
 return message;
end $$;
create or replace function private.close_support_thread(thread uuid) returns void language plpgsql security definer set search_path = '' as $$
declare t public.support_threads%rowtype;
begin
 select * into t from public.support_threads x where x.id = thread for update;
 if not found or (t.user_id <> auth.uid() and not private.has_platform_role(array['support'])) then raise exception 'Not allowed' using errcode = '42501'; end if;
 if t.status = 'closed' then return; end if;
 update public.support_threads set status = 'closed', closed_at = now() where id = thread;
 if t.user_id <> auth.uid() then
  perform private.notify(t.organization_id, t.user_id, 'support', 'أُغلقت تذكرتك', left(t.subject, 120), '/dashboard/support/' || thread);
 end if;
end $$;

-- Team notifications by role; the Telegram part is unchanged (the linked chat).
create or replace function private.notify_platform_admins(org uuid, kind text, title text, body text, url text) returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
 for a in select user_id from private.platform_admins x
  where x.role = 'owner' or (x.role = 'support' and kind in ('support','onboarding','signup')) or (x.role = 'finance' and kind in ('subscription','signup')) loop
  perform private.notify(org, a.user_id, kind, title, body, url);
 end loop;
 if kind not in ('support','subscription','signup') then
  perform private.telegram_queue(left(title, 200) || coalesce(chr(10) || left(body, 500), ''),
   case when url like '/%' then jsonb_build_array(jsonb_build_object('text', 'فتح في اللوحة', 'url', url)) else '[]'::jsonb end);
 end if;
end $$;

-- What the console shows and hides. Any role; null when not an admin with aal2.
create function private.my_platform_role() returns text language sql stable security definer set search_path = '' as $$ select private.platform_role() $$;

-- The team (owner only).
create function private.admin_team() returns table(user_id uuid, email text, role text, created_at timestamptz, last_sign_in_at timestamptz, mfa boolean, invited_by text, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
declare has_factors boolean := to_regclass('auth.mfa_factors') is not null; factor_users uuid[] := '{}';
begin
 perform private.require_platform_admin(array[]::text[]);
 if has_factors then execute 'select coalesce(array_agg(distinct f.user_id), ''{}'') from auth.mfa_factors f where f.status::text = ''verified''' into factor_users; end if;
 return query select a.user_id, u.email::text, a.role, a.created_at, u.last_sign_in_at, case when has_factors then a.user_id = any(factor_users) else null end,
  (select i.email::text from auth.users i where i.id = a.invited_by), a.user_id = auth.uid()
 from private.platform_admins a join auth.users u on u.id = a.user_id
 order by case a.role when 'owner' then 0 when 'finance' then 1 else 2 end, a.created_at;
end $$;

create function private.admin_team_invite(p_email text, p_role text) returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid; mail text := lower(btrim(coalesce(p_email, '')));
begin
 perform private.require_platform_admin(array[]::text[]);
 if p_role is null or p_role not in ('owner','support','finance') then raise exception 'Unknown role' using errcode = '22023'; end if;
 select u.id into target from auth.users u where lower(u.email) = mail;
 if target is null then raise exception 'No account with this email' using errcode = 'P0002'; end if;
 if exists (select 1 from private.platform_admins a where a.user_id = target) then raise exception 'Already on the team' using errcode = '23505'; end if;
 insert into private.platform_admins(user_id, role, invited_by) values (target, p_role, auth.uid());
 if mail not like '%@users.seer.local' then
  insert into private.email_outbox(to_email, subject, body) values (mail, 'سِير — أُضفت لفريق إدارة المنصة',
   'أُضفت لفريق إدارة منصة سِير بدور «' || case p_role when 'owner' then 'مالك' when 'support' then 'دعم' else 'مالية' end
   || '». ادخل لوحة سِير أدمن بحسابك نفسه، وفعّل التحقق الثنائي عند أول دخول.');
 end if;
 perform private.admin_log(null, 'admin_invited', jsonb_build_object('user', target, 'email', mail, 'role', p_role));
 return target;
end $$;

-- At least one owner stays; nobody changes or removes themselves (another owner does it).
create function private.admin_team_guard(p_user uuid, losing_owner boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
 if p_user = auth.uid() then raise exception 'Not on yourself' using errcode = '22023'; end if;
 perform 1 from private.platform_admins a where a.role = 'owner' for update;
 if not exists (select 1 from private.platform_admins a where a.user_id = p_user) then raise exception 'Not on the team' using errcode = 'P0002'; end if;
 if losing_owner and (select count(*) from private.platform_admins a where a.role = 'owner' and a.user_id <> p_user) < 1 then
  raise exception 'At least one owner must remain' using errcode = '22023';
 end if;
end $$;

create function private.admin_team_set_role(p_user uuid, p_role text) returns void language plpgsql security definer set search_path = '' as $$
declare old_role text;
begin
 perform private.require_platform_admin(array[]::text[]);
 if p_role is null or p_role not in ('owner','support','finance') then raise exception 'Unknown role' using errcode = '22023'; end if;
 select a.role into old_role from private.platform_admins a where a.user_id = p_user;
 perform private.admin_team_guard(p_user, old_role = 'owner' and p_role <> 'owner');
 update private.platform_admins set role = p_role where user_id = p_user;
 perform private.admin_log(null, 'admin_role_changed', jsonb_build_object('user', p_user, 'from', old_role, 'to', p_role));
end $$;

create function private.admin_team_remove(p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare old_role text;
begin
 perform private.require_platform_admin(array[]::text[]);
 select a.role into old_role from private.platform_admins a where a.user_id = p_user;
 perform private.admin_team_guard(p_user, old_role = 'owner');
 delete from private.platform_admins where user_id = p_user;
 perform private.admin_log(null, 'admin_removed', jsonb_build_object('user', p_user, 'role', old_role));
end $$;

-- 2) Coupons -------------------------------------------------------------------------------------------
create table private.coupons (
 id uuid primary key default gen_random_uuid(),
 code text not null check (code ~ '^[A-Za-z0-9_-]{3,30}$'),
 kind text not null check (kind in ('percent','fixed')),
 value numeric(10,2) not null check (value > 0 and (kind <> 'percent' or value <= 100)),
 plan_ids uuid[] not null default '{}',            -- empty: every plan
 months integer[] not null default '{}',           -- empty: every duration (1 = monthly … 12 = annual)
 valid_from date,
 valid_until date,
 max_uses integer check (max_uses is null or max_uses > 0),
 max_per_org integer check (max_per_org is null or max_per_org > 0),
 first_payment_only boolean not null default false,
 note text check (note is null or length(note) <= 500),
 is_active boolean not null default true,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (valid_until is null or valid_from is null or valid_until >= valid_from)
);
create unique index coupons_code_idx on private.coupons(lower(code));
alter table private.coupons enable row level security;
revoke all on private.coupons from public, anon, authenticated;

alter table public.subscription_payments add column coupon_id uuid references private.coupons(id) on delete set null;
alter table public.subscription_payments add column coupon_code text;
alter table public.subscription_payments add column base_amount numeric(10,2);
alter table public.subscription_payments add column discount numeric(10,2) not null default 0 check (discount >= 0);
create index subscription_payments_coupon_idx on public.subscription_payments(coupon_id) where coupon_id is not null;

-- {ok, reason, code, base, discount, amount, coupon_id}. reason: empty | not_found | inactive |
-- not_started | expired | plan | period | used_up | org_limit | first_only | price.
create function private.coupon_quote(org uuid, plan uuid, p_months integer, p_code text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c private.coupons%rowtype; base numeric := private.quote_amount(plan, p_months); cut numeric; today date := private.riyadh_today(); reason text;
begin
 if base is null then return jsonb_build_object('ok', false, 'reason', 'price'); end if;
 if btrim(coalesce(p_code, '')) = '' then return jsonb_build_object('ok', false, 'reason', 'empty', 'base', base, 'discount', 0, 'amount', base); end if;
 select * into c from private.coupons x where lower(x.code) = lower(btrim(p_code));
 reason := case
  when not found then 'not_found'
  when not c.is_active then 'inactive'
  when c.valid_from is not null and today < c.valid_from then 'not_started'
  when c.valid_until is not null and today > c.valid_until then 'expired'
  when cardinality(c.plan_ids) > 0 and not plan = any(c.plan_ids) then 'plan'
  when cardinality(c.months) > 0 and not p_months = any(c.months) then 'period'
  when c.max_uses is not null and (select count(*) from public.subscription_payments p where p.coupon_id = c.id and p.status in ('pending','approved')) >= c.max_uses then 'used_up'
  when c.max_per_org is not null and (select count(*) from public.subscription_payments p where p.coupon_id = c.id and p.organization_id = org and p.status in ('pending','approved')) >= c.max_per_org then 'org_limit'
  when c.first_payment_only and exists (select 1 from public.subscription_payments p where p.organization_id = org and p.status in ('pending','approved')) then 'first_only'
 end;
 if reason is not null then return jsonb_build_object('ok', false, 'reason', reason, 'base', base, 'discount', 0, 'amount', base); end if;
 cut := least(base, case when c.kind = 'percent' then round(base * c.value / 100, 2) else c.value end);
 return jsonb_build_object('ok', true, 'reason', null, 'code', c.code, 'kind', c.kind, 'value', c.value, 'base', base, 'discount', cut, 'amount', base - cut, 'coupon_id', c.id);
end $$;

-- For the owner's renewal page: the price with the coupon (no internal id).
create function private.quote_subscription_coupon(org uuid, plan uuid, months integer, code text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.is_org_owner_raw(org) then raise exception 'Only the owner renews' using errcode = '42501'; end if;
 return private.coupon_quote(org, plan, months, code) - 'coupon_id';
end $$;

-- A bank transfer for renewal or upgrade, with an optional coupon. The amount comes from the plan,
-- the duration and the coupon only (same checks as before).
create function private.submit_subscription_payment(org uuid, plan uuid, months integer, reference text, receipt_path text, coupon text) returns uuid language plpgsql security definer set search_path = '' as $$
declare amount numeric; base numeric; cut numeric := 0; quote jsonb; coupon_ref uuid; coupon_text text; id uuid; org_name text;
begin
 if not private.is_org_owner_raw(org) then raise exception 'Only the owner renews' using errcode = '42501'; end if;
 if receipt_path is null or receipt_path !~ ('^' || org::text || '/[A-Za-z0-9_.-]{4,120}$') then raise exception 'Upload the receipt first' using errcode = '22023'; end if;
 if length(btrim(coalesce(reference,''))) < 3 then raise exception 'Write the transfer reference' using errcode = '22023'; end if;
 base := private.quote_amount(plan, months);
 if base is null then raise exception 'Choose an available plan and duration' using errcode = '22023'; end if;
 amount := base;
 if btrim(coalesce(coupon, '')) <> '' then
  -- One submission at a time per coupon, so the use limits hold.
  perform 1 from private.coupons c where lower(c.code) = lower(btrim(coupon)) for update;
  quote := private.coupon_quote(org, plan, months, coupon);
  if not (quote ->> 'ok')::boolean then raise exception 'Coupon not valid: %', quote ->> 'reason' using errcode = '22023'; end if;
  coupon_ref := (quote ->> 'coupon_id')::uuid; coupon_text := quote ->> 'code'; cut := (quote ->> 'discount')::numeric; amount := (quote ->> 'amount')::numeric;
 end if;
 if (select count(*) from public.subscription_payments p where p.organization_id = org and p.status = 'pending') >= 3 then raise exception 'Too many pending transfers' using errcode = '54000'; end if;
 insert into public.subscription_payments(organization_id, plan_id, months, amount, reference, receipt_path, created_by, coupon_id, coupon_code, base_amount, discount)
 values (org, plan, months, amount, left(btrim(reference), 60), receipt_path, auth.uid(), coupon_ref, coupon_text, base, cut) returning subscription_payments.id into id;
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values (org, auth.uid(), 'subscription_payments', id, 'INSERT');
 select o.name into org_name from public.organizations o where o.id = org;
 perform private.notify_platform_admins(org, 'subscription', 'تحويل جديد من ' || coalesce(org_name,'منشأة'),
  to_char(amount,'FM999G999G990D00') || ' ر.س' || case when coupon_text is not null then ' · كوبون ' || coupon_text else '' end, '/admin/payments');
 return id;
end $$;
-- The old 5-argument form keeps working (no coupon).
create or replace function private.submit_subscription_payment(org uuid, plan uuid, months integer, reference text, receipt_path text) returns uuid language sql security definer set search_path = '' as $$
 select private.submit_subscription_payment(org, plan, months, reference, receipt_path, null::text)
$$;

-- Pending transfers with the coupon (finance).
create function private.admin_pending_payments_v2() returns table(id uuid, organization_id uuid, organization text, plan text, months integer, amount numeric, expected numeric,
 base_amount numeric, discount numeric, coupon_code text, reference text, receipt_path text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin(array['finance']);
 return query select x.id, x.organization_id, o.name, p.name, x.months, x.amount, private.quote_amount(x.plan_id, x.months), coalesce(x.base_amount, x.amount), x.discount, x.coupon_code,
  x.reference, x.receipt_path, x.created_at
 from public.subscription_payments x join public.organizations o on o.id = x.organization_id join public.plans p on p.id = x.plan_id
 where x.status = 'pending' order by x.created_at;
end $$;

-- Coupons with their use counts (finance).
create function private.admin_coupons() returns table(id uuid, code text, kind text, value numeric, plan_ids uuid[], months integer[], valid_from date, valid_until date,
 max_uses integer, max_per_org integer, first_payment_only boolean, note text, is_active boolean, created_at timestamptz, used integer, pending integer, discount_total numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin(array['finance']);
 return query select c.id, c.code, c.kind, c.value, c.plan_ids, c.months, c.valid_from, c.valid_until, c.max_uses, c.max_per_org, c.first_payment_only, c.note, c.is_active, c.created_at,
  (select count(*)::integer from public.subscription_payments p where p.coupon_id = c.id and p.status = 'approved'),
  (select count(*)::integer from public.subscription_payments p where p.coupon_id = c.id and p.status = 'pending'),
  coalesce((select sum(p.discount) from public.subscription_payments p where p.coupon_id = c.id and p.status = 'approved'), 0)
 from private.coupons c order by c.is_active desc, c.created_at desc;
end $$;

create function private.admin_coupon_uses(p_coupon uuid) returns table(payment_id uuid, organization_id uuid, organization text, status text, amount numeric, discount numeric, created_at timestamptz, receipt text)
language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin(array['finance']);
 return query select p.id, p.organization_id, o.name, p.status, p.amount, p.discount, p.created_at, (select i.number from public.platform_invoices i where i.payment_id = p.id)
 from public.subscription_payments p join public.organizations o on o.id = p.organization_id where p.coupon_id = p_coupon order by p.created_at desc limit 500;
end $$;

-- Create (p_id null) or edit. A code stays unique ignoring case. Disabling = p_active false.
create function private.admin_save_coupon(p_id uuid, p_code text, p_kind text, p_value numeric, p_plans uuid[], p_months integer[], p_from date, p_until date,
 p_max_uses integer, p_max_per_org integer, p_first_only boolean, p_note text, p_active boolean) returns uuid language plpgsql security definer set search_path = '' as $$
declare saved uuid; code_text text := upper(btrim(coalesce(p_code, '')));
begin
 perform private.require_platform_admin(array['finance']);
 if code_text !~ '^[A-Z0-9_-]{3,30}$' then raise exception 'Code: 3-30 letters, digits, - or _' using errcode = '22023'; end if;
 if p_kind not in ('percent','fixed') or p_value is null or p_value <= 0 or (p_kind = 'percent' and p_value > 100) then raise exception 'Check the discount' using errcode = '22023'; end if;
 if exists (select 1 from unnest(coalesce(p_plans, '{}')) x where not exists (select 1 from public.plans p where p.id = x)) then raise exception 'Unknown plan' using errcode = '22023'; end if;
 if exists (select 1 from unnest(coalesce(p_months, '{}')) x where x not in (1,3,6,12)) then raise exception 'Unknown duration' using errcode = '22023'; end if;
 if p_until is not null and p_from is not null and p_until < p_from then raise exception 'Dates' using errcode = '22023'; end if;
 if exists (select 1 from private.coupons c where lower(c.code) = lower(code_text) and c.id is distinct from p_id) then raise exception 'Code exists' using errcode = '23505'; end if;
 if p_id is null then
  insert into private.coupons(code, kind, value, plan_ids, months, valid_from, valid_until, max_uses, max_per_org, first_payment_only, note, is_active, created_by)
  values (code_text, p_kind, p_value, coalesce(p_plans, '{}'), coalesce(p_months, '{}'), p_from, p_until, p_max_uses, p_max_per_org, coalesce(p_first_only, false), nullif(left(btrim(coalesce(p_note, '')), 500), ''), coalesce(p_active, true), auth.uid())
  returning id into saved;
  perform private.admin_log(null, 'coupon_created', jsonb_build_object('coupon', saved, 'code', code_text, 'kind', p_kind, 'value', p_value));
 else
  update private.coupons c set code = code_text, kind = p_kind, value = p_value, plan_ids = coalesce(p_plans, '{}'), months = coalesce(p_months, '{}'), valid_from = p_from, valid_until = p_until,
   max_uses = p_max_uses, max_per_org = p_max_per_org, first_payment_only = coalesce(p_first_only, false), note = nullif(left(btrim(coalesce(p_note, '')), 500), ''), is_active = coalesce(p_active, true), updated_at = now()
  where c.id = p_id returning c.id into saved;
  if saved is null then raise exception 'No such coupon' using errcode = 'P0002'; end if;
  perform private.admin_log(null, case when coalesce(p_active, true) then 'coupon_updated' else 'coupon_disabled' end, jsonb_build_object('coupon', saved, 'code', code_text));
 end if;
 return saved;
end $$;

-- 3) Receipts and invoices -----------------------------------------------------------------------------
create table private.platform_invoice_counters (year integer primary key, last integer not null default 0);
alter table private.platform_invoice_counters enable row level security;
revoke all on private.platform_invoice_counters from public, anon, authenticated;

create table public.platform_invoices (
 id uuid primary key default gen_random_uuid(),
 number text not null unique,
 kind text not null check (kind in ('receipt','adjustment')),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 organization_name text not null,
 payment_id uuid unique references public.subscription_payments(id) on delete set null,
 description text not null check (length(description) between 2 and 300),
 plan_name text, months integer, period_start date, period_end date,
 base_amount numeric(10,2), discount numeric(10,2) not null default 0, coupon_code text,
 amount numeric(10,2) not null check (amount <> 0),
 reference text, note text check (note is null or length(note) <= 500),
 issued_at timestamptz not null default now(),
 issued_by uuid references auth.users(id) on delete set null
);
create index platform_invoices_org_idx on public.platform_invoices(organization_id, issued_at desc);
alter table public.platform_invoices enable row level security;
revoke all on public.platform_invoices from public, anon, authenticated;
grant select on public.platform_invoices to authenticated;
create policy platform_invoices_read on public.platform_invoices for select to authenticated
 using (private.is_org_owner_raw(organization_id) or private.has_platform_role(array['finance']));

create function private.next_platform_invoice_number(at timestamptz) returns text language plpgsql security definer set search_path = '' as $$
declare y integer := extract(year from (at at time zone 'Asia/Riyadh'))::integer; n integer;
begin
 insert into private.platform_invoice_counters(year, last) values (y, 1) on conflict (year) do update set last = private.platform_invoice_counters.last + 1 returning last into n;
 return 'SEER-' || y || '-' || lpad(n::text, 5, '0');
end $$;

create function private.issue_payment_receipt(payment uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare x record; made uuid;
begin
 select p.*, o.name as org_name, pl.name as plan_name into x from public.subscription_payments p join public.organizations o on o.id = p.organization_id
  left join public.plans pl on pl.id = p.plan_id where p.id = payment and p.status = 'approved';
 if not found or exists (select 1 from public.platform_invoices i where i.payment_id = payment) then return null; end if;
 insert into public.platform_invoices(number, kind, organization_id, organization_name, payment_id, description, plan_name, months, period_start, period_end, base_amount, discount, coupon_code, amount, reference, issued_at, issued_by)
 values (private.next_platform_invoice_number(coalesce(x.decided_at, now())), 'receipt', x.organization_id, x.org_name, x.id,
  'اشتراك منصة سِير — ' || coalesce(x.plan_name, 'باقة') , x.plan_name, x.months, x.period_start, x.period_end, coalesce(x.base_amount, x.amount), x.discount, x.coupon_code, x.amount, x.reference,
  coalesce(x.decided_at, now()), x.decided_by)
 returning id into made;
 return made;
end $$;

create function private.on_payment_approved() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status = 'approved' and old.status is distinct from 'approved' then perform private.issue_payment_receipt(new.id); end if;
 return new;
end $$;
create trigger subscription_payment_receipt after update of status on public.subscription_payments for each row execute function private.on_payment_approved();

-- Existing approved transfers get their numbers now, oldest first.
do $$ declare p record; begin
 for p in select id from public.subscription_payments where status = 'approved' order by coalesce(decided_at, created_at), id loop perform private.issue_payment_receipt(p.id); end loop;
end $$;

-- «إصدار فاتورة»: a manual adjustment for an organization (finance).
create function private.admin_issue_invoice(org uuid, p_description text, p_amount numeric, p_note text) returns uuid language plpgsql security definer set search_path = '' as $$
declare made uuid; org_name text := (select o.name from public.organizations o where o.id = org);
begin
 perform private.require_platform_admin(array['finance']);
 if org_name is null then raise exception 'No such organization' using errcode = 'P0002'; end if;
 if length(btrim(coalesce(p_description, ''))) < 2 or p_amount is null or p_amount = 0 or abs(p_amount) > 1000000 then raise exception 'Check the description and amount' using errcode = '22023'; end if;
 insert into public.platform_invoices(number, kind, organization_id, organization_name, description, amount, note, issued_by)
 values (private.next_platform_invoice_number(now()), 'adjustment', org, org_name, left(btrim(p_description), 300), round(p_amount, 2), nullif(left(btrim(coalesce(p_note, '')), 500), ''), auth.uid())
 returning id into made;
 perform private.notify_owners(org, 'فاتورة جديدة من سِير', left(btrim(p_description), 120));
 perform private.admin_log(org, 'invoice_issued', jsonb_build_object('invoice', made, 'amount', round(p_amount, 2)));
 return made;
end $$;

create function private.admin_invoices(p_org uuid default null, p_search text default null, p_kind text default null, p_page integer default 1)
returns table(id uuid, number text, kind text, organization_id uuid, organization text, description text, amount numeric, discount numeric, coupon_code text, issued_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare q text := nullif(btrim(coalesce(p_search, '')), '');
begin
 perform private.require_platform_admin(array['finance']);
 return query select i.id, i.number, i.kind, i.organization_id, i.organization_name, i.description, i.amount, i.discount, i.coupon_code, i.issued_at, count(*) over ()
 from public.platform_invoices i
 where (p_org is null or i.organization_id = p_org) and (p_kind is null or i.kind = p_kind)
   and (q is null or i.number ilike '%' || q || '%' or i.organization_name ilike '%' || q || '%')
 order by i.issued_at desc, i.number desc limit 50 offset (greatest(coalesce(p_page, 1), 1) - 1) * 50;
end $$;

-- 4) Broadcasts -----------------------------------------------------------------------------------------
create table private.broadcasts (
 id uuid primary key default gen_random_uuid(),
 idempotency_key uuid not null unique,
 title text not null check (length(title) between 2 and 120),
 body text not null check (length(body) between 2 and 2000),
 link text check (link is null or link ~ '^/[A-Za-z0-9/_?=&.%-]*$' or link ~ '^https://[^[:space:]]{4,}$'),
 audience jsonb not null,
 managers boolean not null default false,
 email boolean not null default true,
 organizations integer not null default 0,
 notified integer not null default 0,
 emailed integer not null default 0,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
alter table private.broadcasts enable row level security;
revoke all on private.broadcasts from public, anon, authenticated;
create table private.broadcast_recipients (
 broadcast_id uuid not null references private.broadcasts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 organization_id uuid references public.organizations(id) on delete cascade,
 emailed boolean not null default false,
 primary key (broadcast_id, user_id)
);
alter table private.broadcast_recipients enable row level security;
revoke all on private.broadcast_recipients from public, anon, authenticated;

-- The audience: p_status all | active | trial | grace | locked, optional plan, optional chosen
-- organizations; owners, plus admins (managers) when asked. One row per user (first organization).
create function private.broadcast_targets(p_status text, p_plan uuid, p_orgs uuid[], p_managers boolean)
returns table(organization_id uuid, user_id uuid, email text, role text) language sql stable security definer set search_path = '' as $$
 with orgs as (
  select o.id, private.org_access(o.id) as access, s.status, s.plan_id from public.organizations o left join public.subscriptions s on s.organization_id = o.id
 ), picked as (
  select g.id from orgs g
  where (coalesce(p_status, 'all') = 'all'
     or (p_status = 'active' and g.access = 'active' and coalesce(g.status, '') <> 'trial')
     or (p_status = 'trial' and g.status = 'trial' and g.access <> 'locked')
     or (p_status = 'grace' and g.access = 'grace')
     or (p_status = 'locked' and g.access = 'locked'))
    and (p_plan is null or g.plan_id = p_plan)
    and (coalesce(cardinality(p_orgs), 0) = 0 or g.id = any(p_orgs))
 )
 select distinct on (m.user_id) m.organization_id, m.user_id, u.email::text, m.role
 from picked k join public.memberships m on m.organization_id = k.id join auth.users u on u.id = m.user_id
 where m.role = 'owner' or (coalesce(p_managers, false) and m.role = 'admin')
 order by m.user_id, case m.role when 'owner' then 0 else 1 end, m.organization_id
$$;

create function private.admin_broadcast_preview(p_status text default 'all', p_plan uuid default null, p_orgs uuid[] default null, p_managers boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin(array[]::text[]);
 if coalesce(p_status, 'all') not in ('all','active','trial','grace','locked') then raise exception 'Unknown status' using errcode = '22023'; end if;
 return (select jsonb_build_object('organizations', count(distinct t.organization_id), 'recipients', count(*),
   'emails', count(*) filter (where t.role = 'owner' and t.email is not null and t.email not like '%@users.seer.local'))
  from private.broadcast_targets(p_status, p_plan, p_orgs, p_managers) t);
end $$;

-- Send once per idempotency key: a second call (double click, retry) returns the first result.
create function private.admin_broadcast_send(p_key uuid, p_title text, p_body text, p_link text, p_status text, p_plan uuid, p_orgs uuid[], p_managers boolean, p_email boolean, p_base text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b private.broadcasts%rowtype; t record; link_text text := nullif(btrim(coalesce(p_link, '')), ''); inapp text; mail_link text; n integer := 0; e integer := 0; orgs integer := 0;
begin
 perform private.require_platform_admin(array[]::text[]);
 if p_key is null then raise exception 'Missing key' using errcode = '22023'; end if;
 select * into b from private.broadcasts x where x.idempotency_key = p_key;
 if found then return jsonb_build_object('id', b.id, 'organizations', b.organizations, 'notified', b.notified, 'emailed', b.emailed, 'repeated', true); end if;
 if coalesce(p_status, 'all') not in ('all','active','trial','grace','locked') then raise exception 'Unknown status' using errcode = '22023'; end if;
 if length(btrim(coalesce(p_title, ''))) < 2 or length(btrim(coalesce(p_body, ''))) < 2 then raise exception 'Write the title and text' using errcode = '22023'; end if;
 if link_text is not null and link_text !~ '^/[A-Za-z0-9/_?=&.%-]*$' and link_text !~ '^https://[^[:space:]]{4,}$' then raise exception 'Link' using errcode = '22023'; end if;
 if (select count(*) from private.broadcasts x where x.created_at > now() - interval '1 minute') >= 3 then raise exception 'Slow down' using errcode = '54000'; end if;
 insert into private.broadcasts(idempotency_key, title, body, link, audience, managers, email, created_by)
 values (p_key, left(btrim(p_title), 120), left(btrim(p_body), 2000), link_text,
  jsonb_build_object('status', coalesce(p_status, 'all'), 'plan', p_plan, 'orgs', coalesce(to_jsonb(p_orgs), '[]'::jsonb)), coalesce(p_managers, false), coalesce(p_email, true), auth.uid())
 on conflict (idempotency_key) do nothing returning * into b;
 if b.id is null then -- a concurrent call with the same key won
  select * into b from private.broadcasts x where x.idempotency_key = p_key;
  return jsonb_build_object('id', b.id, 'organizations', b.organizations, 'notified', b.notified, 'emailed', b.emailed, 'repeated', true);
 end if;
 inapp := case when link_text like '/%' then link_text else null end;
 mail_link := case when link_text like '/%' and coalesce(p_base, '') ~ '^https://[a-z0-9.-]+(:[0-9]+)?$' then p_base || link_text when link_text like 'https://%' then link_text end;
 for t in select * from private.broadcast_targets(p_status, p_plan, p_orgs, p_managers) loop
  insert into private.broadcast_recipients(broadcast_id, user_id, organization_id) values (b.id, t.user_id, t.organization_id) on conflict do nothing;
  continue when not found;
  perform private.notify(t.organization_id, t.user_id, 'announcement', b.title,
   case when link_text like 'https://%' then left(b.body, 300 - length(link_text) - 1) || chr(10) || link_text else b.body end, inapp);
  n := n + 1;
  if b.email and t.role = 'owner' and t.email is not null and t.email not like '%@users.seer.local' then
   insert into private.email_outbox(to_email, subject, body) values (t.email, 'سِير — ' || b.title, b.body || coalesce(chr(10) || chr(10) || mail_link, ''));
   update private.broadcast_recipients set emailed = true where broadcast_id = b.id and user_id = t.user_id;
   e := e + 1;
  end if;
 end loop;
 select count(distinct r.organization_id) into orgs from private.broadcast_recipients r where r.broadcast_id = b.id;
 update private.broadcasts set organizations = orgs, notified = n, emailed = e where id = b.id;
 perform private.admin_log(null, 'broadcast_sent', jsonb_build_object('broadcast', b.id, 'title', b.title, 'organizations', orgs, 'notified', n, 'emailed', e));
 return jsonb_build_object('id', b.id, 'organizations', orgs, 'notified', n, 'emailed', e, 'repeated', false);
end $$;

create function private.admin_broadcasts() returns table(id uuid, title text, body text, link text, audience jsonb, managers boolean, email boolean, organizations integer, notified integer, emailed integer, created_at timestamptz, created_by text)
language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin(array[]::text[]);
 return query select b.id, b.title, b.body, b.link, b.audience, b.managers, b.email, b.organizations, b.notified, b.emailed, b.created_at, (select u.email::text from auth.users u where u.id = b.created_by)
 from private.broadcasts b order by b.created_at desc limit 100;
end $$;

-- 5) Login security: IP block list -----------------------------------------------------------------------
create table private.ip_blocks (
 id bigint generated always as identity primary key,
 ip inet not null,
 reason text not null check (length(reason) between 3 and 300),
 expires_at timestamptz,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 removed_at timestamptz,
 removed_by uuid references auth.users(id) on delete set null
);
create index ip_blocks_active_idx on private.ip_blocks(created_at desc) where removed_at is null;
alter table private.ip_blocks enable row level security;
revoke all on private.ip_blocks from public, anon, authenticated;

-- The latest expiry of the blocks covering an address ('infinity' when one never expires), or null.
create function private.ip_blocked_until(p_ip text) returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare address inet;
begin
 begin address := btrim(p_ip)::inet; exception when others then return null; end;
 return (select max(coalesce(b.expires_at, 'infinity'::timestamptz)) from private.ip_blocks b
  where b.removed_at is null and (b.expires_at is null or b.expires_at > now()) and address <<= b.ip);
end $$;

-- The login check (body unchanged) with the block list first: {locked: true, scope: 'blocked'}.
create or replace function private.login_check(p_login text, p_ip text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare account_until timestamptz; ip_until timestamptz; blocked_until timestamptz; login_key text := lower(btrim(coalesce(p_login, '')));
begin
 if nullif(btrim(coalesce(p_ip, '')), '') is not null then
  blocked_until := private.ip_blocked_until(p_ip);
  if blocked_until is not null then
   return jsonb_build_object('locked', true, 'scope', 'blocked', 'retry_after_seconds',
    case when blocked_until = 'infinity'::timestamptz then 86400 else least(ceil(extract(epoch from blocked_until - now()))::integer, 86400) end);
  end if;
 end if;
 if login_key <> '' then account_until := private.login_account_lock(login_key); end if;
 if nullif(btrim(coalesce(p_ip, '')), '') is not null then ip_until := private.login_ip_lock(btrim(p_ip)); end if;
 if account_until <= now() then account_until := null; end if;
 if ip_until <= now() then ip_until := null; end if;
 if account_until is null and ip_until is null then return jsonb_build_object('locked', false, 'scope', null, 'retry_after_seconds', 0); end if;
 if ip_until is not null and (account_until is null or ip_until >= account_until) then
  return jsonb_build_object('locked', true, 'scope', 'ip', 'retry_after_seconds', ceil(extract(epoch from ip_until - now()))::integer);
 end if;
 return jsonb_build_object('locked', true, 'scope', 'account', 'retry_after_seconds', ceil(extract(epoch from account_until - now()))::integer);
end $$;

-- The security page (owner): locks and failing IPs over 24 hours or 7 days, and the block list.
create function private.admin_login_security(p_window text default '24h') returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare since timestamptz;
begin
 perform private.require_platform_admin(array[]::text[]);
 if coalesce(p_window, '24h') not in ('24h','7d') then raise exception 'Window' using errcode = '22023'; end if;
 since := now() - case when p_window = '7d' then interval '7 days' else interval '24 hours' end;
 return jsonb_build_object(
  'window', coalesce(p_window, '24h'),
  'locks', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'scope', l.scope, 'subject', case when l.scope = 'account' then private.login_mask(l.subject) else l.subject end,
    'ip', l.ip, 'failures', l.failures, 'locked_until', l.locked_until, 'created_at', l.created_at, 'active', l.locked_until > now()) order by l.created_at desc)
   from (select * from private.login_locks x where x.created_at > since order by x.created_at desc limit 200) l), '[]'::jsonb),
  'top_ips', coalesce((select jsonb_agg(jsonb_build_object('ip', t.ip, 'failures', t.failures, 'accounts', t.accounts, 'last_at', t.last_at, 'blocked', private.ip_blocked_until(t.ip) is not null) order by t.failures desc)
   from (select a.ip, count(*)::integer as failures, count(distinct a.login)::integer as accounts, max(a.created_at) as last_at from private.login_attempts a
    where not a.ok and a.ip is not null and a.created_at > since group by a.ip order by count(*) desc limit 20) t), '[]'::jsonb),
  'failures', (select count(*) from private.login_attempts a where not a.ok and a.created_at > since),
  'successes', (select count(*) from private.login_attempts a where a.ok and a.created_at > since),
  'blocks', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'ip', host(b.ip) || case when masklen(b.ip) < case when family(b.ip) = 4 then 32 else 128 end then '/' || masklen(b.ip) else '' end,
    'reason', b.reason, 'expires_at', b.expires_at, 'created_at', b.created_at, 'by', (select u.email::text from auth.users u where u.id = b.created_by),
    'active', b.removed_at is null and (b.expires_at is null or b.expires_at > now()), 'removed_at', b.removed_at) order by b.created_at desc)
   from (select * from private.ip_blocks x where x.removed_at is null or x.removed_at > now() - interval '7 days' order by x.created_at desc limit 200) b), '[]'::jsonb));
end $$;

-- Release a lock: it ends now and the failures behind it (last hour) are cleared.
create function private.admin_release_lock(p_lock bigint) returns void language plpgsql security definer set search_path = '' as $$
declare l private.login_locks%rowtype;
begin
 perform private.require_platform_admin(array[]::text[]);
 select * into l from private.login_locks x where x.id = p_lock;
 if not found then raise exception 'No such lock' using errcode = 'P0002'; end if;
 if l.scope = 'account' then delete from private.login_attempts a where a.login = l.subject and not a.ok and a.created_at > now() - interval '1 hour';
 else delete from private.login_attempts a where a.ip = l.subject and not a.ok and a.created_at > now() - interval '1 hour'; end if;
 update private.login_locks x set locked_until = now() where x.scope = l.scope and x.subject = l.subject and x.locked_until > now();
 perform private.admin_log(null, 'login_lock_released', jsonb_build_object('scope', l.scope, 'subject', case when l.scope = 'account' then private.login_mask(l.subject) else l.subject end));
end $$;

create function private.admin_block_ip(p_ip text, p_reason text, p_days integer) returns bigint language plpgsql security definer set search_path = '' as $$
declare address inet; made bigint;
begin
 perform private.require_platform_admin(array[]::text[]);
 begin address := btrim(coalesce(p_ip, ''))::inet; exception when others then raise exception 'Not an IP address' using errcode = '22023'; end;
 if (family(address) = 4 and masklen(address) < 16) or (family(address) = 6 and masklen(address) < 32) then raise exception 'Range too wide' using errcode = '22023'; end if;
 if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Write the reason' using errcode = '22023'; end if;
 if p_days is not null and (p_days < 1 or p_days > 365) then raise exception 'Days 1-365' using errcode = '22023'; end if;
 -- A single address stays as is; a range keeps its prefix without host bits (10.1.2.3/24 → 10.1.2.0/24).
 if masklen(address) < (case when family(address) = 4 then 32 else 128 end) then address := network(address); end if;
 insert into private.ip_blocks(ip, reason, expires_at, created_by) values (address, left(btrim(p_reason), 300),
  case when p_days is null then null else now() + make_interval(days => p_days) end, auth.uid()) returning id into made;
 perform private.admin_log(null, 'ip_blocked', jsonb_build_object('block', made, 'ip', host(address) || '/' || masklen(address), 'days', p_days, 'reason', left(btrim(p_reason), 300)));
 return made;
end $$;

create function private.admin_unblock_ip(p_block bigint) returns void language plpgsql security definer set search_path = '' as $$
declare b private.ip_blocks%rowtype;
begin
 perform private.require_platform_admin(array[]::text[]);
 update private.ip_blocks x set removed_at = now(), removed_by = auth.uid() where x.id = p_block and x.removed_at is null returning * into b;
 if b.id is null then raise exception 'No such block' using errcode = 'P0002'; end if;
 perform private.admin_log(null, 'ip_unblocked', jsonb_build_object('block', b.id, 'ip', host(b.ip) || '/' || masklen(b.ip)));
end $$;

-- 6) Full operations log ---------------------------------------------------------------------------------
create function private.admin_audit_log(p_actor uuid default null, p_action text default null, p_org uuid default null, p_from date default null, p_to date default null,
 p_page integer default 1, p_per integer default 50)
returns table(id bigint, created_at timestamptz, actor_id uuid, actor text, action text, organization_id uuid, organization text, detail jsonb, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare per integer := least(greatest(coalesce(p_per, 50), 1), 5000);
begin
 perform private.require_platform_admin(array[]::text[]);
 return query select a.id, a.created_at, a.actor_id, u.email::text, a.action, a.organization_id, o.name, a.detail, count(*) over ()
 from private.platform_audit a left join auth.users u on u.id = a.actor_id left join public.organizations o on o.id = a.organization_id
 where (p_actor is null or a.actor_id = p_actor) and (p_action is null or a.action = p_action) and (p_org is null or a.organization_id = p_org)
   and (p_from is null or a.created_at >= (p_from::timestamp at time zone 'Asia/Riyadh'))
   and (p_to is null or a.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Riyadh'))
 order by a.created_at desc, a.id desc limit per offset (greatest(coalesce(p_page, 1), 1) - 1) * per;
end $$;

create function private.admin_audit_filters() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin(array[]::text[]);
 return jsonb_build_object(
  'actors', coalesce((select jsonb_agg(jsonb_build_object('id', x.actor_id, 'email', x.email) order by x.email) from
   (select distinct a.actor_id, u.email::text as email from private.platform_audit a join auth.users u on u.id = a.actor_id) x), '[]'::jsonb),
  'actions', coalesce((select jsonb_agg(x.action order by x.action) from (select distinct a.action from private.platform_audit a) x), '[]'::jsonb));
end $$;

-- An export is itself recorded.
create function private.admin_audit_exported(p_rows integer) returns void language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_platform_admin(array[]::text[]);
 perform private.admin_log(null, 'audit_exported', jsonb_build_object('rows', p_rows));
end $$;

-- Grants -------------------------------------------------------------------------------------------------
revoke all on function private.platform_role(), private.has_platform_role(text[]), private.require_platform_admin(text[]), private.my_platform_role(),
 private.admin_team(), private.admin_team_invite(text,text), private.admin_team_guard(uuid,boolean), private.admin_team_set_role(uuid,text), private.admin_team_remove(uuid),
 private.coupon_quote(uuid,uuid,integer,text), private.quote_subscription_coupon(uuid,uuid,integer,text), private.submit_subscription_payment(uuid,uuid,integer,text,text,text),
 private.admin_pending_payments_v2(), private.admin_coupons(), private.admin_coupon_uses(uuid),
 private.admin_save_coupon(uuid,text,text,numeric,uuid[],integer[],date,date,integer,integer,boolean,text,boolean),
 private.next_platform_invoice_number(timestamptz), private.issue_payment_receipt(uuid), private.on_payment_approved(), private.admin_issue_invoice(uuid,text,numeric,text),
 private.admin_invoices(uuid,text,text,integer), private.broadcast_targets(text,uuid,uuid[],boolean), private.admin_broadcast_preview(text,uuid,uuid[],boolean),
 private.admin_broadcast_send(uuid,text,text,text,text,uuid,uuid[],boolean,boolean,text), private.admin_broadcasts(), private.ip_blocked_until(text),
 private.admin_login_security(text), private.admin_release_lock(bigint), private.admin_block_ip(text,text,integer), private.admin_unblock_ip(bigint),
 private.admin_audit_log(uuid,text,uuid,date,date,integer,integer), private.admin_audit_filters(), private.admin_audit_exported(integer)
 from public, anon, authenticated;
-- RLS on platform_invoices calls these as the reader.
grant execute on function private.has_platform_role(text[]), private.platform_role() to authenticated;
grant execute on function private.require_platform_admin(text[]), private.my_platform_role(),
 private.admin_team(), private.admin_team_invite(text,text), private.admin_team_set_role(uuid,text), private.admin_team_remove(uuid),
 private.quote_subscription_coupon(uuid,uuid,integer,text), private.submit_subscription_payment(uuid,uuid,integer,text,text,text),
 private.admin_pending_payments_v2(), private.admin_coupons(), private.admin_coupon_uses(uuid),
 private.admin_save_coupon(uuid,text,text,numeric,uuid[],integer[],date,date,integer,integer,boolean,text,boolean),
 private.admin_issue_invoice(uuid,text,numeric,text), private.admin_invoices(uuid,text,text,integer), private.admin_broadcast_preview(text,uuid,uuid[],boolean),
 private.admin_broadcast_send(uuid,text,text,text,text,uuid,uuid[],boolean,boolean,text), private.admin_broadcasts(),
 private.admin_login_security(text), private.admin_release_lock(bigint), private.admin_block_ip(text,text,integer), private.admin_unblock_ip(bigint),
 private.admin_audit_log(uuid,text,uuid,date,date,integer,integer), private.admin_audit_filters(), private.admin_audit_exported(integer)
 to authenticated;
grant execute on function private.ip_blocked_until(text) to service_role;

-- Public wrappers (authenticated; every one checks again inside).
create function public.my_platform_role() returns text language sql stable set search_path = '' as $$ select private.my_platform_role() $$;
create function public.admin_team() returns table(user_id uuid, email text, role text, created_at timestamptz, last_sign_in_at timestamptz, mfa boolean, invited_by text, is_me boolean)
 language sql stable set search_path = '' as $$ select * from private.admin_team() $$;
create function public.admin_team_invite(p_email text, p_role text) returns uuid language sql set search_path = '' as $$ select private.admin_team_invite(p_email, p_role) $$;
create function public.admin_team_set_role(p_user uuid, p_role text) returns void language sql set search_path = '' as $$ select private.admin_team_set_role(p_user, p_role) $$;
create function public.admin_team_remove(p_user uuid) returns void language sql set search_path = '' as $$ select private.admin_team_remove(p_user) $$;
create function public.quote_subscription_coupon(org uuid, plan uuid, months integer, code text) returns jsonb language sql stable set search_path = '' as $$ select private.quote_subscription_coupon(org, plan, months, code) $$;
create function public.submit_subscription_payment(org uuid, plan uuid, months integer, reference text, receipt_path text, coupon text) returns uuid language sql set search_path = '' as $$
 select private.submit_subscription_payment(org, plan, months, reference, receipt_path, coupon) $$;
create function public.admin_pending_payments_v2() returns table(id uuid, organization_id uuid, organization text, plan text, months integer, amount numeric, expected numeric,
 base_amount numeric, discount numeric, coupon_code text, reference text, receipt_path text, created_at timestamptz)
 language sql stable set search_path = '' as $$ select * from private.admin_pending_payments_v2() $$;
create function public.admin_coupons() returns table(id uuid, code text, kind text, value numeric, plan_ids uuid[], months integer[], valid_from date, valid_until date,
 max_uses integer, max_per_org integer, first_payment_only boolean, note text, is_active boolean, created_at timestamptz, used integer, pending integer, discount_total numeric)
 language sql stable set search_path = '' as $$ select * from private.admin_coupons() $$;
create function public.admin_coupon_uses(p_coupon uuid) returns table(payment_id uuid, organization_id uuid, organization text, status text, amount numeric, discount numeric, created_at timestamptz, receipt text)
 language sql stable set search_path = '' as $$ select * from private.admin_coupon_uses(p_coupon) $$;
create function public.admin_save_coupon(p_id uuid, p_code text, p_kind text, p_value numeric, p_plans uuid[], p_months integer[], p_from date, p_until date,
 p_max_uses integer, p_max_per_org integer, p_first_only boolean, p_note text, p_active boolean) returns uuid language sql set search_path = '' as $$
 select private.admin_save_coupon(p_id, p_code, p_kind, p_value, p_plans, p_months, p_from, p_until, p_max_uses, p_max_per_org, p_first_only, p_note, p_active) $$;
create function public.admin_issue_invoice(org uuid, p_description text, p_amount numeric, p_note text) returns uuid language sql set search_path = '' as $$ select private.admin_issue_invoice(org, p_description, p_amount, p_note) $$;
create function public.admin_invoices(p_org uuid default null, p_search text default null, p_kind text default null, p_page integer default 1)
 returns table(id uuid, number text, kind text, organization_id uuid, organization text, description text, amount numeric, discount numeric, coupon_code text, issued_at timestamptz, total bigint)
 language sql stable set search_path = '' as $$ select * from private.admin_invoices(p_org, p_search, p_kind, p_page) $$;
create function public.admin_broadcast_preview(p_status text default 'all', p_plan uuid default null, p_orgs uuid[] default null, p_managers boolean default false) returns jsonb
 language sql stable set search_path = '' as $$ select private.admin_broadcast_preview(p_status, p_plan, p_orgs, p_managers) $$;
create function public.admin_broadcast_send(p_key uuid, p_title text, p_body text, p_link text, p_status text, p_plan uuid, p_orgs uuid[], p_managers boolean, p_email boolean, p_base text) returns jsonb
 language sql set search_path = '' as $$ select private.admin_broadcast_send(p_key, p_title, p_body, p_link, p_status, p_plan, p_orgs, p_managers, p_email, p_base) $$;
create function public.admin_broadcasts() returns table(id uuid, title text, body text, link text, audience jsonb, managers boolean, email boolean, organizations integer, notified integer, emailed integer, created_at timestamptz, created_by text)
 language sql stable set search_path = '' as $$ select * from private.admin_broadcasts() $$;
create function public.admin_login_security(p_window text default '24h') returns jsonb language sql stable set search_path = '' as $$ select private.admin_login_security(p_window) $$;
create function public.admin_release_lock(p_lock bigint) returns void language sql set search_path = '' as $$ select private.admin_release_lock(p_lock) $$;
create function public.admin_block_ip(p_ip text, p_reason text, p_days integer default null) returns bigint language sql set search_path = '' as $$ select private.admin_block_ip(p_ip, p_reason, p_days) $$;
create function public.admin_unblock_ip(p_block bigint) returns void language sql set search_path = '' as $$ select private.admin_unblock_ip(p_block) $$;
create function public.admin_audit_log(p_actor uuid default null, p_action text default null, p_org uuid default null, p_from date default null, p_to date default null, p_page integer default 1, p_per integer default 50)
 returns table(id bigint, created_at timestamptz, actor_id uuid, actor text, action text, organization_id uuid, organization text, detail jsonb, total bigint)
 language sql stable set search_path = '' as $$ select * from private.admin_audit_log(p_actor, p_action, p_org, p_from, p_to, p_page, p_per) $$;
create function public.admin_audit_filters() returns jsonb language sql stable set search_path = '' as $$ select private.admin_audit_filters() $$;
create function public.admin_audit_exported(p_rows integer) returns void language sql set search_path = '' as $$ select private.admin_audit_exported(p_rows) $$;

revoke all on function public.my_platform_role(), public.admin_team(), public.admin_team_invite(text,text), public.admin_team_set_role(uuid,text), public.admin_team_remove(uuid),
 public.quote_subscription_coupon(uuid,uuid,integer,text), public.submit_subscription_payment(uuid,uuid,integer,text,text,text), public.admin_pending_payments_v2(),
 public.admin_coupons(), public.admin_coupon_uses(uuid), public.admin_save_coupon(uuid,text,text,numeric,uuid[],integer[],date,date,integer,integer,boolean,text,boolean),
 public.admin_issue_invoice(uuid,text,numeric,text), public.admin_invoices(uuid,text,text,integer), public.admin_broadcast_preview(text,uuid,uuid[],boolean),
 public.admin_broadcast_send(uuid,text,text,text,text,uuid,uuid[],boolean,boolean,text), public.admin_broadcasts(), public.admin_login_security(text),
 public.admin_release_lock(bigint), public.admin_block_ip(text,text,integer), public.admin_unblock_ip(bigint),
 public.admin_audit_log(uuid,text,uuid,date,date,integer,integer), public.admin_audit_filters(), public.admin_audit_exported(integer)
 from public, anon, authenticated, service_role;
grant execute on function public.my_platform_role(), public.admin_team(), public.admin_team_invite(text,text), public.admin_team_set_role(uuid,text), public.admin_team_remove(uuid),
 public.quote_subscription_coupon(uuid,uuid,integer,text), public.submit_subscription_payment(uuid,uuid,integer,text,text,text), public.admin_pending_payments_v2(),
 public.admin_coupons(), public.admin_coupon_uses(uuid), public.admin_save_coupon(uuid,text,text,numeric,uuid[],integer[],date,date,integer,integer,boolean,text,boolean),
 public.admin_issue_invoice(uuid,text,numeric,text), public.admin_invoices(uuid,text,text,integer), public.admin_broadcast_preview(text,uuid,uuid[],boolean),
 public.admin_broadcast_send(uuid,text,text,text,text,uuid,uuid[],boolean,boolean,text), public.admin_broadcasts(), public.admin_login_security(text),
 public.admin_release_lock(bigint), public.admin_block_ip(text,text,integer), public.admin_unblock_ip(bigint),
 public.admin_audit_log(uuid,text,uuid,date,date,integer,integer), public.admin_audit_filters(), public.admin_audit_exported(integer)
 to authenticated;
commit;
