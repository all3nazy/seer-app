-- Subscriptions for schools and nurseries.
-- 1) Plans with their sections (features) and monthly price; durations with a discount.
-- 2) One subscription per organization (trial, active, grace, locked, suspended), bank-transfer
--    payments with a receipt in a private storage bucket, platform settings, per-organization
--    settings (sections turned off, brand colours).
-- 3) Access is computed in one place, private.org_access(org): active, grace or locked. A locked
--    organization is closed by the database itself: private.is_org_member and private.can_manage_org
--    return false, so every existing RLS policy closes. Billing tables use the "raw" membership checks
--    so the owner can still renew; the platform admin keeps access.
-- 4) Advanced sections (transport, payroll, learning, online payments) can only be written when the
--    plan includes them (or during the trial) and the organization has not turned them off.
-- 5) Family links (portal, documents, payments) close while locked if the platform says so.
-- 6) Sign-up with a 14-day trial (one per email and per phone), admin console functions (all
--    audited), daily reminders and status sync (pg_cron).
-- Amounts are always computed by the database from the plan and the duration.
-- Forward-only.
begin;

-- 1) Plans and durations ---------------------------------------------------------------------------
create table public.plans (
 id uuid primary key default gen_random_uuid(),
 key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
 name text not null check (length(btrim(name)) between 1 and 60),
 description text check (description is null or length(description) <= 300),
 features text[] not null default '{}' check (array_position(features, null) is null),
 monthly_price numeric(10,2) not null check (monthly_price >= 0),
 sort_order integer not null default 0,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.plan_durations (
 months integer primary key check (months in (1,3,6,12)),
 discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 90),
 is_active boolean not null default true
);
alter table public.plans enable row level security;
alter table public.plan_durations enable row level security;
revoke all on public.plans, public.plan_durations from public,anon,authenticated;
grant select on public.plans, public.plan_durations to anon, authenticated;
grant execute on function private.is_platform_admin() to anon;
create policy plans_read on public.plans for select to anon, authenticated using (is_active or private.is_platform_admin());
create policy plan_durations_read on public.plan_durations for select to anon, authenticated using (true);

-- Sections a plan can include. Core pages (students, attendance, classes, settings, team) are always on.
create function private.feature_keys() returns text[] language sql immutable set search_path = '' as $$
 select array['pickup','daily','messages','announcements','inquiries','tasks','finance','admissions','staff','assistant',
              'transport','learning','payroll','reports','online_payments']
$$;
revoke all on function private.feature_keys() from public;
grant execute on function private.feature_keys() to anon, authenticated;

insert into public.plans(key,name,description,features,monthly_price,sort_order) values
 ('basic','الأساسية','للتشغيل اليومي: الحضور والتسليم والتقارير اليومية والرسائل والمالية والموظفين.',
  array['pickup','daily','messages','announcements','inquiries','tasks','finance','admissions','staff','assistant'], 299, 1),
 ('advanced','المتقدمة','كل شيء في الأساسية، ومعها النقل والرواتب والدراسة والدرجات والتقارير والدفع الإلكتروني.',
  private.feature_keys(), 499, 2);
insert into public.plan_durations(months,discount_percent) values (1,0),(3,5),(6,10),(12,20);

-- 2) Subscriptions, payments and settings ----------------------------------------------------------
create table public.platform_settings (
 id boolean primary key default true check (id),
 bank_accounts jsonb not null default '[]' check (jsonb_typeof(bank_accounts) = 'array'),
 trial_days integer not null default 14 check (trial_days between 1 and 90),
 grace_days integer not null default 7 check (grace_days between 0 and 60),
 lock_family_links boolean not null default true,
 updated_at timestamptz not null default now()
);
insert into public.platform_settings(id) values (true);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from public,anon,authenticated;
grant select on public.platform_settings to authenticated;
create policy platform_settings_read on public.platform_settings for select to authenticated using (true);

create table public.subscriptions (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 plan_id uuid not null references public.plans(id),
 status text not null default 'trial' check (status in ('trial','active','grace','locked','suspended')),
 starts_on date not null default (now() at time zone 'Asia/Riyadh')::date,
 ends_on date not null,
 admin_notes text check (admin_notes is null or length(admin_notes) <= 2000),
 updated_at timestamptz not null default now(),
 constraint subscriptions_dates check (ends_on >= starts_on)
);
create index subscriptions_ends_idx on public.subscriptions(ends_on);
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from public,anon,authenticated;
grant select on public.subscriptions to authenticated;

create table public.subscription_payments (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 plan_id uuid not null references public.plans(id),
 months integer not null references public.plan_durations(months),
 amount numeric(10,2) not null check (amount >= 0),
 reference text not null check (length(btrim(reference)) between 3 and 60),
 receipt_path text not null check (length(receipt_path) between 10 and 300),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 reject_reason text check (reject_reason is null or length(reject_reason) <= 500),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 decided_by uuid references auth.users(id) on delete set null,
 decided_at timestamptz,
 period_start date,
 period_end date
);
create index subscription_payments_org_idx on public.subscription_payments(organization_id, created_at desc);
create index subscription_payments_pending_idx on public.subscription_payments(created_at) where status = 'pending';
alter table public.subscription_payments enable row level security;
revoke all on public.subscription_payments from public,anon,authenticated;
grant select on public.subscription_payments to authenticated;

create table public.organization_settings (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 disabled_features text[] not null default '{}' check (array_position(disabled_features, null) is null),
 primary_color text check (primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$'),
 accent_color text check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'),
 updated_at timestamptz not null default now()
);
alter table public.organization_settings enable row level security;
revoke all on public.organization_settings from public,anon,authenticated;
grant select on public.organization_settings to authenticated;

-- Platform-level audit (plans, prices, platform settings); organization actions go to audit_events.
create table private.platform_audit (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id) on delete set null,
 action text not null,
 detail jsonb not null default '{}',
 created_at timestamptz not null default now()
);
alter table private.platform_audit enable row level security;
revoke all on private.platform_audit from public,anon,authenticated;

-- 3) Access ----------------------------------------------------------------------------------------
create function private.riyadh_today() returns date language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Riyadh')::date $$;
revoke all on function private.riyadh_today() from public;
grant execute on function private.riyadh_today() to anon, authenticated;

-- active: within the paid or trial period; grace: within the grace days after it; locked: after
-- that, or suspended by the platform. An organization without a subscription row is active.
create function private.org_access(org uuid) returns text language sql stable security definer set search_path = '' as $$
 select coalesce((
  select case
   when s.status = 'suspended' then 'locked'
   when s.ends_on >= private.riyadh_today() then 'active'
   when s.ends_on + coalesce((select p.grace_days from public.platform_settings p limit 1), 7) >= private.riyadh_today() then 'grace'
   else 'locked' end
  from public.subscriptions s where s.organization_id = org), 'active')
$$;
revoke all on function private.org_access(uuid) from public,anon,authenticated;
grant execute on function private.org_access(uuid) to anon, authenticated;

-- Membership checks that ignore the lock (billing) and the lock-aware ones used by every policy.
create function private.is_org_member_raw(org uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.memberships m where m.organization_id = org and m.user_id = (select auth.uid()))
$$;
create function private.can_manage_org_raw(org uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.memberships m where m.organization_id = org and m.user_id = (select auth.uid()) and m.role in ('owner','admin'))
$$;
create function private.is_org_owner_raw(org uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.memberships m where m.organization_id = org and m.user_id = (select auth.uid()) and m.role = 'owner')
$$;
revoke all on function private.is_org_member_raw(uuid), private.can_manage_org_raw(uuid), private.is_org_owner_raw(uuid) from public,anon,authenticated;
grant execute on function private.is_org_member_raw(uuid), private.can_manage_org_raw(uuid), private.is_org_owner_raw(uuid) to authenticated;

create or replace function private.is_org_member(org uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_org_member_raw(org) and private.org_access(org) <> 'locked'
$$;
create or replace function private.can_manage_org(org uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.can_manage_org_raw(org) and private.org_access(org) <> 'locked'
$$;
-- People still see their own memberships while locked, so the app can send them to renewal.
drop policy if exists membership_read on public.memberships;
create policy membership_read on public.memberships for select to authenticated using (user_id = (select auth.uid()) or private.is_org_member(organization_id));
drop policy if exists org_read on public.organizations;
create policy org_read on public.organizations for select to authenticated using (private.is_org_member_raw(id) or private.is_platform_admin());

create policy subscriptions_read on public.subscriptions for select to authenticated using (private.is_org_member_raw(organization_id) or private.is_platform_admin());
create policy subscription_payments_read on public.subscription_payments for select to authenticated using (private.is_org_owner_raw(organization_id) or private.is_platform_admin());
create policy organization_settings_read on public.organization_settings for select to authenticated using (private.is_org_member_raw(organization_id) or private.is_platform_admin());

-- Sections: in the plan (or any section during the trial), and not turned off by the organization.
create function private.org_has_feature(org uuid, feature text) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce((
  select (s.status = 'trial' or feature = any(p.features))
     and not (feature = any(coalesce((select o.disabled_features from public.organization_settings o where o.organization_id = org), '{}')))
  from public.subscriptions s join public.plans p on p.id = s.plan_id where s.organization_id = org), true)
$$;
revoke all on function private.org_has_feature(uuid,text) from public,anon,authenticated;
grant execute on function private.org_has_feature(uuid,text) to anon, authenticated;
create function public.org_has_feature(org uuid, feature text) returns boolean language sql stable set search_path = '' as $$
 select private.is_org_member_raw(org) and private.org_has_feature(org, feature)
$$;
revoke all on function public.org_has_feature(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.org_has_feature(uuid,text) to authenticated;

do $$
declare t text; f text; cmd text;
begin
 for t, f in select * from (values
  ('vehicles','transport'),('bus_routes','transport'),('route_stops','transport'),('transport_trips','transport'),('trip_events','transport'),
  ('payroll_runs','payroll'),('payroll_lines','payroll'),
  ('subjects','learning'),('timetable_slots','learning'),('assessments','learning'),('grades','learning'),('behavior_notes','learning'),
  ('payment_settings','online_payments')) as x(t,f)
 loop
  execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (private.org_has_feature(organization_id, %L))', t || '_feature_insert', t, f);
  execute format('create policy %I on public.%I as restrictive for update to authenticated using (private.org_has_feature(organization_id, %L))', t || '_feature_update', t, f);
  execute format('create policy %I on public.%I as restrictive for delete to authenticated using (private.org_has_feature(organization_id, %L))', t || '_feature_delete', t, f);
 end loop;
end $$;

-- 4) Receipts: private bucket; an owner uploads into their organization's folder, the platform reads all.
create function private.receipt_owner_ok(object_name text) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare folder text := split_part(coalesce(object_name,''), '/', 1);
begin
 if folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
 return private.is_org_owner_raw(folder::uuid);
end $$;
revoke all on function private.receipt_owner_ok(text) from public,anon,authenticated;
grant execute on function private.receipt_owner_ok(text) to authenticated;
do $$
begin
 if to_regclass('storage.objects') is not null then
  insert into storage.buckets(id, name, public) values ('subscription-receipts','subscription-receipts', false) on conflict (id) do nothing;
  execute 'create policy subscription_receipts_insert on storage.objects for insert to authenticated with check (bucket_id = ''subscription-receipts'' and private.receipt_owner_ok(name))';
  execute 'create policy subscription_receipts_read on storage.objects for select to authenticated using (bucket_id = ''subscription-receipts'' and (private.is_platform_admin() or private.receipt_owner_ok(name)))';
 end if;
end $$;

-- 5) Family links close while locked when the platform says so ------------------------------------
create function private.links_open(org uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select org is null or not (coalesce((select p.lock_family_links from public.platform_settings p limit 1), true) and private.org_access(org) = 'locked')
$$;
revoke all on function private.links_open(uuid) from public,anon,authenticated;
grant execute on function private.links_open(uuid) to anon, authenticated;
create function private.document_org(token uuid) returns uuid language sql stable security definer set search_path = '' as $$
 select coalesce((select i.organization_id from public.invoices i where i.share_token = token), (select q.organization_id from public.quotes q where q.share_token = token))
$$;
create function private.portal_org(token uuid) returns uuid language sql stable security definer set search_path = '' as $$
 select p.organization_id from private.guardian_portals p where p.token = portal_org.token
$$;
revoke all on function private.document_org(uuid), private.portal_org(uuid) from public,anon,authenticated;
grant execute on function private.document_org(uuid), private.portal_org(uuid) to anon, authenticated;

create or replace function public.family_portal(token uuid) returns jsonb language sql stable set search_path = '' as $$
 select case when private.links_open(private.portal_org(token)) then private.family_portal(token) end
$$;
create or replace function public.shared_document(token uuid) returns jsonb language sql stable set search_path = '' as $$
 select case when private.links_open(private.document_org(token)) then private.shared_document(token) end
$$;
create or replace function public.payment_intent_view(token uuid, intent uuid) returns jsonb language sql stable set search_path = '' as $$
 select case when private.links_open(private.document_org(token)) then private.payment_intent_view(token, intent) end
$$;
create function private.require_links_open(org uuid, feature text) returns void language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.links_open(org) then raise exception 'This link is paused' using errcode = '42501'; end if;
 if feature is not null and org is not null and not private.org_has_feature(org, feature) then raise exception 'Not available' using errcode = '42501'; end if;
end $$;
revoke all on function private.require_links_open(uuid,text) from public,anon,authenticated;
grant execute on function private.require_links_open(uuid,text) to anon, authenticated;
create or replace function public.start_online_payment(token uuid, method text) returns jsonb language plpgsql set search_path = '' as $$
begin
 perform private.require_links_open(private.document_org(token), 'online_payments');
 return private.start_online_payment(token, method);
end $$;
create or replace function public.submit_absence_notice(token uuid, child uuid, from_day date, to_day date, note text default null) returns text language plpgsql set search_path = '' as $$
begin
 perform private.require_links_open(private.portal_org(token), null);
 return private.submit_absence_notice(token, child, from_day, to_day, note);
end $$;

-- 6) Notifications for subscriptions ---------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('task','inquiry','inquiry_reply','leave','leave_decision','application','payment','absence_notice','announcement','member','subscription','signup'));
create function private.notify_platform_admins(org uuid, kind text, title text, body text, url text) returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
 for a in select user_id from private.platform_admins loop perform private.notify(org, a.user_id, kind, title, body, url); end loop;
end $$;
create function private.notify_owners(org uuid, title text, body text) returns void language plpgsql security definer set search_path = '' as $$
declare m record;
begin
 for m in select user_id from public.memberships where organization_id = org and role = 'owner' loop
  perform private.notify(org, m.user_id, 'subscription', title, body, '/dashboard/billing');
 end loop;
end $$;
revoke all on function private.notify_platform_admins(uuid,text,text,text,text), private.notify_owners(uuid,text,text) from public,anon,authenticated;

-- Email reminders wait here until an email provider is configured (the dispatcher sends them).
create table private.email_outbox (
 id uuid primary key default gen_random_uuid(),
 to_email text not null,
 subject text not null,
 body text not null,
 status text not null default 'queued' check (status in ('queued','sent','failed')),
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
alter table private.email_outbox enable row level security;
revoke all on private.email_outbox from public,anon,authenticated;

-- 7) Trials for new organizations ------------------------------------------------------------------
create function private.start_trial() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.subscriptions(organization_id, plan_id, status, starts_on, ends_on)
 select new.id, p.id, 'trial', private.riyadh_today(), private.riyadh_today() + coalesce((select s.trial_days from public.platform_settings s limit 1), 14)
 from public.plans p where p.key = 'advanced'
 on conflict (organization_id) do nothing;
 return null;
end $$;
revoke all on function private.start_trial() from public,anon,authenticated;
create trigger start_trial after insert on public.organizations for each row execute function private.start_trial();

-- Existing organizations keep working: «المتقدمة» active for a year from today.
insert into public.subscriptions(organization_id, plan_id, status, starts_on, ends_on, admin_notes)
select o.id, p.id, 'active', private.riyadh_today(), (private.riyadh_today() + interval '1 year')::date, 'اشتراك انتقالي عند إطلاق الاشتراكات'
from public.organizations o cross join public.plans p where p.key = 'advanced'
on conflict (organization_id) do nothing;

-- 8) Pricing and billing for the subscriber -------------------------------------------------------
create function private.quote_amount(plan uuid, months integer) returns numeric language sql stable security definer set search_path = '' as $$
 select round(p.monthly_price * d.months * (1 - d.discount_percent / 100), 2)
 from public.plans p join public.plan_durations d on d.months = quote_amount.months where p.id = plan and p.is_active and d.is_active
$$;
revoke all on function private.quote_amount(uuid,integer) from public,anon,authenticated;
create function public.quote_subscription(plan uuid, months integer) returns numeric language sql stable set search_path = '' as $$ select private.quote_amount(plan, months) $$;
revoke all on function public.quote_subscription(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.quote_subscription(uuid,integer) to anon, authenticated;
grant execute on function private.quote_amount(uuid,integer) to anon, authenticated;

create function public.pricing() returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
  'plans', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'key',p.key,'name',p.name,'description',p.description,'features',to_jsonb(p.features),'monthly_price',p.monthly_price) order by p.sort_order, p.monthly_price) from public.plans p where p.is_active), '[]'),
  'durations', coalesce((select jsonb_agg(jsonb_build_object('months',d.months,'discount',d.discount_percent) order by d.months) from public.plan_durations d where d.is_active), '[]'),
  'trial_days', (select s.trial_days from public.platform_settings s limit 1))
$$;
revoke all on function public.pricing() from public,anon,authenticated,service_role;
grant execute on function public.pricing() to anon, authenticated;

-- Everything the billing page needs, readable by members even while locked (payments: owners only).
create function private.billing_overview(org uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.subscriptions%rowtype; is_owner boolean := private.is_org_owner_raw(org);
begin
 if not private.is_org_member_raw(org) then raise exception 'Not allowed' using errcode = '42501'; end if;
 select * into s from public.subscriptions x where x.organization_id = org;
 return jsonb_build_object(
  'access', private.org_access(org), 'status', s.status, 'starts_on', s.starts_on, 'ends_on', s.ends_on,
  'days_left', case when s.ends_on is null then null else s.ends_on - private.riyadh_today() end,
  'grace_days', (select p.grace_days from public.platform_settings p limit 1),
  'owner', is_owner,
  'plan', (select jsonb_build_object('id',p.id,'key',p.key,'name',p.name,'features',to_jsonb(p.features),'monthly_price',p.monthly_price) from public.plans p where p.id = s.plan_id),
  'bank_accounts', case when is_owner then (select p.bank_accounts from public.platform_settings p limit 1) else '[]'::jsonb end,
  'payments', case when is_owner then coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'plan',(select p.name from public.plans p where p.id = x.plan_id),'months',x.months,'amount',x.amount,
     'reference',x.reference,'status',x.status,'reject_reason',x.reject_reason,'created_at',x.created_at,'decided_at',x.decided_at,'period_start',x.period_start,'period_end',x.period_end) order by x.created_at desc)
     from public.subscription_payments x where x.organization_id = org), '[]') else '[]'::jsonb end);
end $$;
revoke all on function private.billing_overview(uuid) from public,anon,authenticated;
grant execute on function private.billing_overview(uuid) to authenticated;
create function public.billing_overview(org uuid) returns jsonb language sql stable set search_path = '' as $$ select private.billing_overview(org) $$;
revoke all on function public.billing_overview(uuid) from public,anon,authenticated,service_role;
grant execute on function public.billing_overview(uuid) to authenticated;

-- The signed-in person's organizations with their access, plan sections and brand colours.
create function private.my_organizations() returns table(organization_id uuid, name text, type text, role text, access text, status text, ends_on date, days_left integer, plan_key text, features text[], disabled_features text[], primary_color text, accent_color text)
language sql stable security definer set search_path = '' as $$
 select m.organization_id, o.name, o.type, m.role, private.org_access(m.organization_id), s.status, s.ends_on, s.ends_on - private.riyadh_today(), p.key,
  case when s.status = 'trial' or s.organization_id is null then private.feature_keys() else p.features end,
  coalesce(os.disabled_features, '{}'), os.primary_color, os.accent_color
 from public.memberships m join public.organizations o on o.id = m.organization_id
 left join public.subscriptions s on s.organization_id = m.organization_id left join public.plans p on p.id = s.plan_id
 left join public.organization_settings os on os.organization_id = m.organization_id
 where m.user_id = auth.uid()
 order by m.joined_at
$$;
revoke all on function private.my_organizations() from public,anon,authenticated;
grant execute on function private.my_organizations() to authenticated;
create function public.my_organizations() returns table(organization_id uuid, name text, type text, role text, access text, status text, ends_on date, days_left integer, plan_key text, features text[], disabled_features text[], primary_color text, accent_color text)
language sql stable set search_path = '' as $$ select * from private.my_organizations() $$;
revoke all on function public.my_organizations() from public,anon,authenticated,service_role;
grant execute on function public.my_organizations() to authenticated;

-- A bank transfer for renewal or upgrade. The amount comes from the plan and the duration only.
create function private.submit_subscription_payment(org uuid, plan uuid, months integer, reference text, receipt_path text) returns uuid language plpgsql security definer set search_path = '' as $$
declare amount numeric; id uuid; org_name text;
begin
 if not private.is_org_owner_raw(org) then raise exception 'Only the owner renews' using errcode = '42501'; end if;
 if receipt_path is null or receipt_path !~ ('^' || org::text || '/[A-Za-z0-9_.-]{4,120}$') then raise exception 'Upload the receipt first' using errcode = '22023'; end if;
 if length(btrim(coalesce(reference,''))) < 3 then raise exception 'Write the transfer reference' using errcode = '22023'; end if;
 amount := private.quote_amount(plan, months);
 if amount is null then raise exception 'Choose an available plan and duration' using errcode = '22023'; end if;
 if (select count(*) from public.subscription_payments p where p.organization_id = org and p.status = 'pending') >= 3 then raise exception 'Too many pending transfers' using errcode = '54000'; end if;
 insert into public.subscription_payments(organization_id, plan_id, months, amount, reference, receipt_path, created_by)
 values (org, plan, months, amount, left(btrim(reference), 60), receipt_path, auth.uid()) returning subscription_payments.id into id;
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values (org, auth.uid(), 'subscription_payments', id, 'INSERT');
 select o.name into org_name from public.organizations o where o.id = org;
 perform private.notify_platform_admins(org, 'subscription', 'تحويل جديد من ' || coalesce(org_name,'منشأة'), to_char(amount,'FM999G999G990D00') || ' ر.س', '/admin/payments');
 return id;
end $$;
revoke all on function private.submit_subscription_payment(uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function private.submit_subscription_payment(uuid,uuid,integer,text,text) to authenticated;
create function public.submit_subscription_payment(org uuid, plan uuid, months integer, reference text, receipt_path text) returns uuid language sql set search_path = '' as $$ select private.submit_subscription_payment(org, plan, months, reference, receipt_path) $$;
revoke all on function public.submit_subscription_payment(uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.submit_subscription_payment(uuid,uuid,integer,text,text) to authenticated;

-- The owner turns sections off (within the plan) and picks brand colours.
create function private.save_org_settings(org uuid, disabled text[], primary_color text, accent_color text) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_org_owner_raw(org) then raise exception 'Only the owner' using errcode = '42501'; end if;
 if not (coalesce(disabled,'{}') <@ private.feature_keys()) then raise exception 'Unknown section' using errcode = '22023'; end if;
 insert into public.organization_settings(organization_id, disabled_features, primary_color, accent_color) values (org, coalesce(disabled,'{}'), primary_color, accent_color)
 on conflict (organization_id) do update set disabled_features = excluded.disabled_features, primary_color = excluded.primary_color, accent_color = excluded.accent_color, updated_at = now();
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values (org, auth.uid(), 'organization_settings', org, 'UPDATE');
end $$;
revoke all on function private.save_org_settings(uuid,text[],text,text) from public,anon,authenticated;
grant execute on function private.save_org_settings(uuid,text[],text,text) to authenticated;
create function public.save_org_settings(org uuid, disabled text[], primary_color text default null, accent_color text default null) returns void language sql set search_path = '' as $$ select private.save_org_settings(org, disabled, primary_color, accent_color) $$;
revoke all on function public.save_org_settings(uuid,text[],text,text) from public,anon,authenticated,service_role;
grant execute on function public.save_org_settings(uuid,text[],text,text) to authenticated;

-- 9) Sign-up with a trial --------------------------------------------------------------------------
create table private.pending_signups (
 email text primary key,
 phone text not null,
 full_name text not null,
 org_name text not null,
 org_type text not null check (org_type in ('school','nursery','kindergarten')),
 attempts integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table private.trial_claims (
 email text not null unique,
 phone text not null unique,
 organization_id uuid references public.organizations(id) on delete set null,
 created_at timestamptz not null default now()
);
alter table private.pending_signups enable row level security;
alter table private.trial_claims enable row level security;
revoke all on private.pending_signups, private.trial_claims from public,anon,authenticated;

create function private.clean_phone(phone text) returns text language sql immutable set search_path = '' as $$
 select case when v ~ '^5[0-9]{8}$' then '0' || v when v ~ '^9665[0-9]{8}$' then '0' || substr(v, 4) else v end
 from (select regexp_replace(translate(coalesce(phone,''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '[^0-9]', '', 'g') as v) x
$$;
revoke all on function private.clean_phone(text) from public,anon,authenticated;

-- Step 1 (before the account exists): records the request; one trial per email and per phone.
create function private.start_signup(in_email text, in_phone text, in_full_name text, in_org_name text, in_org_type text) returns text language plpgsql security definer set search_path = '' as $$
declare e text := lower(btrim(coalesce(in_email,''))); p text := private.clean_phone(in_phone); existing private.pending_signups%rowtype;
begin
 if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 254 then raise exception 'Invalid email' using errcode = '22023'; end if;
 if p !~ '^05[0-9]{8}$' then raise exception 'Invalid phone' using errcode = '22023'; end if;
 if length(btrim(coalesce(in_full_name,''))) not between 2 and 80 or length(btrim(coalesce(in_org_name,''))) not between 2 and 120 then raise exception 'Invalid names' using errcode = '22023'; end if;
 if in_org_type is null or in_org_type not in ('school','nursery','kindergarten') then raise exception 'Invalid type' using errcode = '22023'; end if;
 if exists (select 1 from private.trial_claims t where t.email = e or t.phone = p) then raise exception 'Trial already used' using errcode = '23505'; end if;
 if exists (select 1 from private.pending_signups s where s.phone = p and s.email <> e and s.updated_at > now() - interval '1 day') then raise exception 'Phone already used' using errcode = '23505'; end if;
 if (select count(*) from private.pending_signups s where s.updated_at > now() - interval '1 hour') >= 100 then raise exception 'Try later' using errcode = '54000'; end if;
 select * into existing from private.pending_signups s where s.email = e;
 if found and existing.attempts >= 5 and existing.updated_at > now() - interval '1 day' then raise exception 'Too many attempts' using errcode = '54000'; end if;
 insert into private.pending_signups(email, phone, full_name, org_name, org_type) values (e, p, btrim(in_full_name), btrim(in_org_name), in_org_type)
 on conflict (email) do update set phone = excluded.phone, full_name = excluded.full_name, org_name = excluded.org_name, org_type = excluded.org_type,
  attempts = case when private.pending_signups.updated_at > now() - interval '1 day' then private.pending_signups.attempts + 1 else 1 end, updated_at = now();
 return 'ok';
end $$;
-- Step 2 (after the email is verified): creates the organization, the owner and the trial.
create function private.complete_signup() returns uuid language plpgsql security definer set search_path = '' as $$
declare u record; s private.pending_signups%rowtype; org uuid; trial integer;
begin
 select x.id, lower(x.email) as email, x.email_confirmed_at into u from auth.users x where x.id = auth.uid();
 if u.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
 if u.email_confirmed_at is null then raise exception 'Verify your email first' using errcode = '42501'; end if;
 select * into s from private.pending_signups p where p.email = u.email for update;
 if not found then return null; end if;
 if exists (select 1 from private.trial_claims t where t.email = s.email or t.phone = s.phone) then
  delete from private.pending_signups where email = s.email;
  raise exception 'Trial already used' using errcode = '23505';
 end if;
 insert into public.organizations(name, type) values (s.org_name, s.org_type) returning id into org;
 insert into public.memberships(organization_id, user_id, role, display_name) values (org, u.id, 'owner', s.full_name);
 insert into public.member_phones(organization_id, user_id, phone) values (org, u.id, s.phone) on conflict do nothing;
 trial := coalesce((select p.trial_days from public.platform_settings p limit 1), 14);
 update public.subscriptions set plan_id = (select p.id from public.plans p where p.key = 'advanced'), status = 'trial', starts_on = private.riyadh_today(), ends_on = private.riyadh_today() + trial where organization_id = org;
 insert into private.trial_claims(email, phone, organization_id) values (s.email, s.phone, org);
 delete from private.pending_signups where email = s.email;
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values (org, u.id, 'subscriptions', org, 'INSERT');
 perform private.notify_platform_admins(org, 'signup', 'مشترك جديد: ' || s.org_name, s.full_name || ' · ' || s.phone, '/admin/subscribers/' || org);
 return org;
end $$;
revoke all on function private.start_signup(text,text,text,text,text), private.complete_signup() from public,anon,authenticated;
grant execute on function private.start_signup(text,text,text,text,text) to anon, authenticated;
grant execute on function private.complete_signup() to authenticated;
create function public.start_signup(email text, phone text, full_name text, org_name text, org_type text) returns text language sql set search_path = '' as $$ select private.start_signup(email, phone, full_name, org_name, org_type) $$;
create function public.complete_signup() returns uuid language sql set search_path = '' as $$ select private.complete_signup() $$;
revoke all on function public.start_signup(text,text,text,text,text), public.complete_signup() from public,anon,authenticated,service_role;
grant execute on function public.start_signup(text,text,text,text,text) to anon, authenticated;
grant execute on function public.complete_signup() to authenticated;

-- 10) Platform admin console ------------------------------------------------------------------------
create function private.require_platform_admin() returns void language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.is_platform_admin() then raise exception 'Platform admins only' using errcode = '42501'; end if;
end $$;
revoke all on function private.require_platform_admin() from public,anon,authenticated;
create function private.audit_subscription(org uuid, action text) returns void language sql security definer set search_path = '' as $$
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values (org, auth.uid(), 'subscriptions', org, action)
$$;
revoke all on function private.audit_subscription(uuid,text) from public,anon,authenticated;

-- Recomputes the stored status from the dates (kept in step daily and after every admin action).
create function private.sync_status(org uuid) returns void language sql security definer set search_path = '' as $$
 update public.subscriptions s set status = case
   when s.status = 'suspended' then 'suspended'
   when private.org_access(org) = 'locked' then 'locked'
   when private.org_access(org) = 'grace' then 'grace'
   when s.status = 'trial' then 'trial' else 'active' end, updated_at = now()
 where s.organization_id = org
$$;
revoke all on function private.sync_status(uuid) from public,anon,authenticated;

create function private.admin_overview() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 return jsonb_build_object(
  'mrr', coalesce((select sum(coalesce(
       (select x.amount / x.months from public.subscription_payments x where x.organization_id = s.organization_id and x.status = 'approved' order by x.decided_at desc limit 1),
       p.monthly_price)) from public.subscriptions s join public.plans p on p.id = s.plan_id where s.status <> 'trial' and private.org_access(s.organization_id) in ('active','grace')), 0),
  'active', (select count(*) from public.subscriptions s where s.status <> 'trial' and private.org_access(s.organization_id) = 'active'),
  'trial', (select count(*) from public.subscriptions s where s.status = 'trial' and private.org_access(s.organization_id) = 'active'),
  'grace', (select count(*) from public.subscriptions s where private.org_access(s.organization_id) = 'grace'),
  'locked', (select count(*) from public.subscriptions s where private.org_access(s.organization_id) = 'locked'),
  'expiring', (select count(*) from public.subscriptions s where s.status <> 'suspended' and s.ends_on between private.riyadh_today() and private.riyadh_today() + 14),
  'pending', (select count(*) from public.subscription_payments x where x.status = 'pending'));
end $$;

create function private.admin_subscribers(search text, filter text) returns table(organization_id uuid, name text, type text, plan text, status text, access text, ends_on date, days_left integer, owner_email text, owner_phone text, students bigint, staff bigint, pending bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 return query
 select o.id, o.name, o.type, p.name, s.status, private.org_access(o.id), s.ends_on, s.ends_on - private.riyadh_today(),
  (select u.email::text from public.memberships m join auth.users u on u.id = m.user_id where m.organization_id = o.id and m.role = 'owner' order by m.joined_at limit 1),
  (select ph.phone from public.memberships m join public.member_phones ph on ph.user_id = m.user_id and ph.organization_id = o.id where m.organization_id = o.id and m.role = 'owner' limit 1),
  (select count(*) from public.children c where c.organization_id = o.id and c.status = 'active'),
  (select count(*) from public.memberships m where m.organization_id = o.id),
  (select count(*) from public.subscription_payments x where x.organization_id = o.id and x.status = 'pending')
 from public.organizations o left join public.subscriptions s on s.organization_id = o.id left join public.plans p on p.id = s.plan_id
 where (coalesce(search,'') = '' or o.name ilike '%' || replace(replace(search,'%',''),'_','') || '%')
   and (coalesce(filter,'') = '' or (filter = 'trial' and s.status = 'trial' and private.org_access(o.id) = 'active') or (filter <> 'trial' and private.org_access(o.id) = filter and (filter <> 'active' or s.status <> 'trial')))
 order by s.ends_on nulls last
 limit 300;
end $$;

create function private.admin_subscriber(org uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 return (select jsonb_build_object('organization_id', o.id, 'name', o.name, 'type', o.type, 'created_at', o.created_at,
   'subscription', (select to_jsonb(s) from public.subscriptions s where s.organization_id = o.id),
   'access', private.org_access(o.id),
   'plan', (select jsonb_build_object('id',p.id,'name',p.name) from public.subscriptions s join public.plans p on p.id = s.plan_id where s.organization_id = o.id),
   'owners', coalesce((select jsonb_agg(jsonb_build_object('name', m.display_name, 'email', u.email, 'phone', (select ph.phone from public.member_phones ph where ph.user_id = m.user_id and ph.organization_id = o.id limit 1)))
      from public.memberships m join auth.users u on u.id = m.user_id where m.organization_id = o.id and m.role = 'owner'), '[]'),
   'students', (select count(*) from public.children c where c.organization_id = o.id and c.status = 'active'),
   'staff', (select count(*) from public.memberships m where m.organization_id = o.id),
   'payments', coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'plan',(select p.name from public.plans p where p.id = x.plan_id),'months',x.months,'amount',x.amount,'reference',x.reference,'status',x.status,'reject_reason',x.reject_reason,'created_at',x.created_at,'decided_at',x.decided_at) order by x.created_at desc)
      from public.subscription_payments x where x.organization_id = o.id), '[]'))
  from public.organizations o where o.id = org);
end $$;

create function private.admin_pending_payments() returns table(id uuid, organization_id uuid, organization text, plan text, months integer, amount numeric, expected numeric, reference text, receipt_path text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 return query select x.id, x.organization_id, o.name, p.name, x.months, x.amount, private.quote_amount(x.plan_id, x.months), x.reference, x.receipt_path, x.created_at
 from public.subscription_payments x join public.organizations o on o.id = x.organization_id join public.plans p on p.id = x.plan_id
 where x.status = 'pending' order by x.created_at;
end $$;

-- Approve: a running subscription is extended from its end date; otherwise it starts today.
create function private.admin_approve_payment(payment uuid) returns date language plpgsql security definer set search_path = '' as $$
declare x public.subscription_payments%rowtype; s public.subscriptions%rowtype; base date; new_end date; today date := private.riyadh_today();
begin
 perform private.require_platform_admin();
 select * into x from public.subscription_payments p where p.id = payment for update;
 if not found or x.status <> 'pending' then raise exception 'Not a pending transfer' using errcode = '22023'; end if;
 select * into s from public.subscriptions where organization_id = x.organization_id for update;
 base := case when s.ends_on is not null and s.ends_on >= today and s.status <> 'suspended' then s.ends_on else today end;
 new_end := (base + make_interval(months => x.months))::date;
 insert into public.subscriptions(organization_id, plan_id, status, starts_on, ends_on) values (x.organization_id, x.plan_id, 'active', today, new_end)
 on conflict (organization_id) do update set plan_id = x.plan_id, status = 'active', starts_on = case when base = today then today else public.subscriptions.starts_on end, ends_on = new_end, updated_at = now();
 update public.subscription_payments set status = 'approved', decided_by = auth.uid(), decided_at = now(), period_start = base, period_end = new_end where id = x.id;
 perform private.audit_subscription(x.organization_id, 'UPDATE');
 perform private.notify_owners(x.organization_id, 'تم تفعيل اشتراكك ✓', 'ساري حتى ' || to_char(new_end, 'YYYY-MM-DD'));
 return new_end;
end $$;
create function private.admin_reject_payment(payment uuid, reason text) returns void language plpgsql security definer set search_path = '' as $$
declare x public.subscription_payments%rowtype;
begin
 perform private.require_platform_admin();
 if length(btrim(coalesce(reason,''))) < 3 then raise exception 'Write the reason' using errcode = '22023'; end if;
 select * into x from public.subscription_payments p where p.id = payment for update;
 if not found or x.status <> 'pending' then raise exception 'Not a pending transfer' using errcode = '22023'; end if;
 update public.subscription_payments set status = 'rejected', reject_reason = left(btrim(reason), 500), decided_by = auth.uid(), decided_at = now() where id = x.id;
 perform private.audit_subscription(x.organization_id, 'UPDATE');
 perform private.notify_owners(x.organization_id, 'لم يُعتمد التحويل', left(btrim(reason), 200));
end $$;
create function private.admin_extend(org uuid, days integer) returns date language plpgsql security definer set search_path = '' as $$
declare new_end date;
begin
 perform private.require_platform_admin();
 if days is null or days not between 1 and 730 then raise exception 'Days must be 1 to 730' using errcode = '22023'; end if;
 update public.subscriptions s set ends_on = greatest(s.ends_on, private.riyadh_today()) + days, updated_at = now() where s.organization_id = org returning s.ends_on into new_end;
 if new_end is null then raise exception 'No subscription' using errcode = 'P0002'; end if;
 perform private.sync_status(org);
 perform private.audit_subscription(org, 'UPDATE');
 perform private.notify_owners(org, 'تم تمديد اشتراكك', 'ساري حتى ' || to_char(new_end, 'YYYY-MM-DD'));
 return new_end;
end $$;
create function private.admin_set_plan(org uuid, plan uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 if not exists (select 1 from public.plans p where p.id = plan) then raise exception 'Unknown plan' using errcode = '22023'; end if;
 update public.subscriptions set plan_id = plan, status = case when status = 'trial' then 'active' else status end, updated_at = now() where organization_id = org;
 perform private.sync_status(org);
 perform private.audit_subscription(org, 'UPDATE');
end $$;
create function private.admin_set_suspended(org uuid, suspended boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 update public.subscriptions set status = case when suspended then 'suspended' else 'active' end, updated_at = now() where organization_id = org;
 perform private.sync_status(org);
 perform private.audit_subscription(org, 'UPDATE');
 perform private.notify_owners(org, case when suspended then 'تم إيقاف اشتراك المنشأة' else 'تمت إعادة تفعيل الاشتراك ✓' end, null);
end $$;
create function private.admin_set_note(org uuid, note text) returns void language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 update public.subscriptions set admin_notes = left(nullif(btrim(note),''), 2000), updated_at = now() where organization_id = org;
 perform private.audit_subscription(org, 'UPDATE');
end $$;
create function private.admin_save_plan(plan uuid, key text, name text, description text, features text[], monthly_price numeric, sort_order integer, is_active boolean) returns uuid language plpgsql security definer set search_path = '' as $$
declare id uuid;
begin
 perform private.require_platform_admin();
 if not (coalesce(features,'{}') <@ private.feature_keys()) then raise exception 'Unknown section' using errcode = '22023'; end if;
 if plan is null then
  insert into public.plans(key, name, description, features, monthly_price, sort_order, is_active) values (key, name, description, coalesce(features,'{}'), monthly_price, coalesce(sort_order,0), coalesce(is_active,true)) returning plans.id into id;
 else
  update public.plans p set name = admin_save_plan.name, description = admin_save_plan.description, features = coalesce(admin_save_plan.features,'{}'), monthly_price = admin_save_plan.monthly_price,
   sort_order = coalesce(admin_save_plan.sort_order, p.sort_order), is_active = coalesce(admin_save_plan.is_active, p.is_active), updated_at = now() where p.id = plan returning p.id into id;
  if id is null then raise exception 'Unknown plan' using errcode = 'P0002'; end if;
 end if;
 insert into private.platform_audit(actor_id, action, detail) values (auth.uid(), case when plan is null then 'plan_created' else 'plan_updated' end,
  jsonb_build_object('plan', id, 'name', name, 'monthly_price', monthly_price, 'features', to_jsonb(features), 'is_active', is_active));
 return id;
end $$;
create function private.admin_save_duration(months integer, discount numeric, active boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 update public.plan_durations d set discount_percent = discount, is_active = coalesce(active, d.is_active) where d.months = admin_save_duration.months;
 if not found then raise exception 'Unknown duration' using errcode = 'P0002'; end if;
 insert into private.platform_audit(actor_id, action, detail) values (auth.uid(), 'duration_updated', jsonb_build_object('months', months, 'discount', discount, 'active', active));
end $$;
create function private.admin_save_settings(bank_accounts jsonb, trial_days integer, grace_days integer, lock_family_links boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 if jsonb_typeof(bank_accounts) <> 'array' or jsonb_array_length(bank_accounts) > 5 or exists (
   select 1 from jsonb_array_elements(bank_accounts) a where coalesce(a->>'iban','') !~ '^SA[0-9]{22}$' or length(coalesce(a->>'bank','')) < 2 or length(coalesce(a->>'holder','')) < 2) then
  raise exception 'Check the bank accounts' using errcode = '22023';
 end if;
 update public.platform_settings p set bank_accounts = admin_save_settings.bank_accounts, trial_days = admin_save_settings.trial_days, grace_days = admin_save_settings.grace_days,
  lock_family_links = admin_save_settings.lock_family_links, updated_at = now();
 insert into private.platform_audit(actor_id, action, detail) values (auth.uid(), 'settings_updated', jsonb_build_object('trial_days', trial_days, 'grace_days', grace_days, 'lock_family_links', lock_family_links, 'accounts', jsonb_array_length(bank_accounts)));
end $$;
create function private.admin_audit() returns table(action text, detail jsonb, created_at timestamptz) language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 return query select a.action, a.detail, a.created_at from private.platform_audit a order by a.created_at desc limit 100;
end $$;
create function private.am_platform_admin() returns boolean language sql stable security definer set search_path = '' as $$ select private.is_platform_admin() $$;

revoke all on function private.admin_overview(), private.admin_subscribers(text,text), private.admin_subscriber(uuid), private.admin_pending_payments(), private.admin_approve_payment(uuid),
 private.admin_reject_payment(uuid,text), private.admin_extend(uuid,integer), private.admin_set_plan(uuid,uuid), private.admin_set_suspended(uuid,boolean), private.admin_set_note(uuid,text),
 private.admin_save_plan(uuid,text,text,text,text[],numeric,integer,boolean), private.admin_save_duration(integer,numeric,boolean), private.admin_save_settings(jsonb,integer,integer,boolean),
 private.admin_audit(), private.am_platform_admin() from public,anon,authenticated;
grant execute on function private.admin_overview(), private.admin_subscribers(text,text), private.admin_subscriber(uuid), private.admin_pending_payments(), private.admin_approve_payment(uuid),
 private.admin_reject_payment(uuid,text), private.admin_extend(uuid,integer), private.admin_set_plan(uuid,uuid), private.admin_set_suspended(uuid,boolean), private.admin_set_note(uuid,text),
 private.admin_save_plan(uuid,text,text,text,text[],numeric,integer,boolean), private.admin_save_duration(integer,numeric,boolean), private.admin_save_settings(jsonb,integer,integer,boolean),
 private.admin_audit(), private.am_platform_admin() to authenticated;

create function public.admin_overview() returns jsonb language sql stable set search_path = '' as $$ select private.admin_overview() $$;
create function public.admin_subscribers(search text default null, filter text default null) returns table(organization_id uuid, name text, type text, plan text, status text, access text, ends_on date, days_left integer, owner_email text, owner_phone text, students bigint, staff bigint, pending bigint) language sql stable set search_path = '' as $$ select * from private.admin_subscribers(search, filter) $$;
create function public.admin_subscriber(org uuid) returns jsonb language sql stable set search_path = '' as $$ select private.admin_subscriber(org) $$;
create function public.admin_pending_payments() returns table(id uuid, organization_id uuid, organization text, plan text, months integer, amount numeric, expected numeric, reference text, receipt_path text, created_at timestamptz) language sql stable set search_path = '' as $$ select * from private.admin_pending_payments() $$;
create function public.admin_approve_payment(payment uuid) returns date language sql set search_path = '' as $$ select private.admin_approve_payment(payment) $$;
create function public.admin_reject_payment(payment uuid, reason text) returns void language sql set search_path = '' as $$ select private.admin_reject_payment(payment, reason) $$;
create function public.admin_extend(org uuid, days integer) returns date language sql set search_path = '' as $$ select private.admin_extend(org, days) $$;
create function public.admin_set_plan(org uuid, plan uuid) returns void language sql set search_path = '' as $$ select private.admin_set_plan(org, plan) $$;
create function public.admin_set_suspended(org uuid, suspended boolean) returns void language sql set search_path = '' as $$ select private.admin_set_suspended(org, suspended) $$;
create function public.admin_set_note(org uuid, note text) returns void language sql set search_path = '' as $$ select private.admin_set_note(org, note) $$;
create function public.admin_save_plan(plan uuid, key text, name text, description text, features text[], monthly_price numeric, sort_order integer, is_active boolean) returns uuid language sql set search_path = '' as $$ select private.admin_save_plan(plan, key, name, description, features, monthly_price, sort_order, is_active) $$;
create function public.admin_save_duration(months integer, discount numeric, active boolean) returns void language sql set search_path = '' as $$ select private.admin_save_duration(months, discount, active) $$;
create function public.admin_save_settings(bank_accounts jsonb, trial_days integer, grace_days integer, lock_family_links boolean) returns void language sql set search_path = '' as $$ select private.admin_save_settings(bank_accounts, trial_days, grace_days, lock_family_links) $$;
create function public.admin_audit() returns table(action text, detail jsonb, created_at timestamptz) language sql stable set search_path = '' as $$ select * from private.admin_audit() $$;
create function public.am_platform_admin() returns boolean language sql stable set search_path = '' as $$ select private.am_platform_admin() $$;
revoke all on function public.admin_overview(), public.admin_subscribers(text,text), public.admin_subscriber(uuid), public.admin_pending_payments(), public.admin_approve_payment(uuid),
 public.admin_reject_payment(uuid,text), public.admin_extend(uuid,integer), public.admin_set_plan(uuid,uuid), public.admin_set_suspended(uuid,boolean), public.admin_set_note(uuid,text),
 public.admin_save_plan(uuid,text,text,text,text[],numeric,integer,boolean), public.admin_save_duration(integer,numeric,boolean), public.admin_save_settings(jsonb,integer,integer,boolean),
 public.admin_audit(), public.am_platform_admin() from public,anon,authenticated,service_role;
grant execute on function public.admin_overview(), public.admin_subscribers(text,text), public.admin_subscriber(uuid), public.admin_pending_payments(), public.admin_approve_payment(uuid),
 public.admin_reject_payment(uuid,text), public.admin_extend(uuid,integer), public.admin_set_plan(uuid,uuid), public.admin_set_suspended(uuid,boolean), public.admin_set_note(uuid,text),
 public.admin_save_plan(uuid,text,text,text,text[],numeric,integer,boolean), public.admin_save_duration(integer,numeric,boolean), public.admin_save_settings(jsonb,integer,integer,boolean),
 public.admin_audit(), public.am_platform_admin() to authenticated;

-- 11) Daily reminders and status sync (pg_cron, 06:00 Riyadh) --------------------------------------
create table private.subscription_reminders (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 kind text not null,
 ends_on date not null,
 sent_at timestamptz not null default now(),
 primary key (organization_id, kind, ends_on)
);
alter table private.subscription_reminders enable row level security;
revoke all on private.subscription_reminders from public,anon,authenticated;

create function private.reminder_text(kind text, ends_on date) returns text language sql immutable set search_path = '' as $$
 select case kind
  when 'd7' then 'ينتهي اشتراك منشأتك بعد ٧ أيام (' || to_char(ends_on,'YYYY-MM-DD') || '). جدّده من صفحة الاشتراك حتى ما يتوقف العمل.'
  when 'd3' then 'باقي ٣ أيام على نهاية اشتراك منشأتك. جدّده من صفحة الاشتراك.'
  when 'd1' then 'ينتهي اشتراك منشأتك بكرة. جدّده اليوم حتى ما تدخل المنشأة في المهلة.'
  when 'grace' then 'انتهى اشتراك منشأتك وبدأت مهلة التجديد. المنصة تعمل طوال المهلة، وتنقفل بعدها حتى التجديد.'
  else 'انقفلت المنصة لانتهاء الاشتراك. بياناتك محفوظة بالكامل، وتنفتح مباشرة بعد التجديد.' end
$$;
create function private.subscription_daily() returns integer language plpgsql security definer set search_path = '' as $$
declare s record; kind text; days integer; grace integer := coalesce((select p.grace_days from public.platform_settings p limit 1), 7); sent integer := 0; msg text; o record;
begin
 for s in select x.organization_id, x.ends_on, x.status from public.subscriptions x where x.status <> 'suspended' loop
  perform private.sync_status(s.organization_id);
  days := s.ends_on - private.riyadh_today();
  kind := case when days in (7,3,1) then 'd' || days when days = -1 then 'grace' when days = -(grace + 1) then 'locked' end;
  continue when kind is null;
  insert into private.subscription_reminders(organization_id, kind, ends_on) values (s.organization_id, kind, s.ends_on) on conflict do nothing;
  continue when not found;
  msg := private.reminder_text(kind, s.ends_on);
  perform private.notify_owners(s.organization_id, case when kind = 'locked' then 'انقفلت المنصة' when kind = 'grace' then 'بدأت مهلة التجديد' else 'تذكير بتجديد الاشتراك' end, msg);
  for o in select u.email, ph.phone, (select ms.channel from public.message_settings ms where ms.organization_id = s.organization_id) as channel
           from public.memberships m join auth.users u on u.id = m.user_id
           left join public.member_phones ph on ph.user_id = m.user_id and ph.organization_id = s.organization_id
           where m.organization_id = s.organization_id and m.role = 'owner' loop
   if o.email is not null and o.email not like '%@users.seer.local' then
    insert into private.email_outbox(to_email, subject, body) values (o.email, 'سِير — اشتراك منشأتك', msg);
   end if;
   if o.channel is not null and o.phone ~ '^\+?[0-9]{8,15}$' then
    insert into public.message_outbox(organization_id, channel, to_phone, kind, body, dedupe_key)
    values (s.organization_id, o.channel, o.phone, 'custom', 'سِير: ' || msg, 'subscription:' || kind || ':' || s.ends_on || ':' || o.phone)
    on conflict do nothing;
   end if;
  end loop;
  sent := sent + 1;
 end loop;
 return sent;
end $$;
revoke all on function private.reminder_text(text,date), private.subscription_daily() from public,anon,authenticated;

do $$ begin
 perform cron.schedule('seer-subscriptions-daily', '0 3 * * *', 'select private.subscription_daily()');
exception when others then null;
end $$;
commit;
