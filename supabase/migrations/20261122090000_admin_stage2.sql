-- «سِير أدمن», stage 2: the full organization profile, a real overview, and the subscribers list.
-- Every function here starts with private.require_platform_admin() (a platform admin with aal2 once
-- 20261121090000_admin_aal2 is applied) and records each action in private.platform_audit, now
-- with the organization it concerns.
-- 1) private.platform_audit.organization_id (+ index), and private.admin_log().
-- 2) Entitlements: private.org_entitlements.blocked_features = sections the platform does not allow
--    an organization at all (default: none, so the plan decides; the pilot keeps everything open).
--    org_has_feature() refuses a blocked section (RLS and RPCs), and my_organizations() returns
--    blocked_features so the app hides the section and its pages.
-- 3) private.org_admin_notes: the platform team's private notes per organization.
-- 4) Subscription cancellation fields (cancelled_at, cancel_reason): cancelling ends the
--    subscription today without grace; the data stays and an extension opens it again.
-- 5) Overview: admin_overview_v2() (decisions, numbers, health, activity).
-- 6) Subscribers list: admin_subscribers_v2(search, status, plan, ending, sort, page).
-- 7) Organization profile: admin_org_profile(org), and the actions admin_org_extend,
--    admin_org_set_plan, admin_org_set_suspended, admin_org_cancel, admin_org_free_month,
--    admin_unlock_login, admin_transfer_ownership, admin_set_entitlements, admin_onboarding_remind,
--    admin_save_org_note; each audited and, where it changes the subscription or the owner,
--    notifying the owner in the app.
-- Forward-only.
begin;

-- 1) Audit per organization --------------------------------------------------------------------------
alter table private.platform_audit add column organization_id uuid references public.organizations(id) on delete set null;
create index platform_audit_org_idx on private.platform_audit(organization_id, created_at desc);

create function private.admin_log(org uuid, what text, detail jsonb default '{}'::jsonb) returns void language sql security definer set search_path = '' as $$
 insert into private.platform_audit(actor_id, action, detail, organization_id) values (auth.uid(), what, coalesce(detail, '{}'::jsonb), org)
$$;

-- 2) Entitlements --------------------------------------------------------------------------------------
create table private.org_entitlements (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 blocked_features text[] not null default '{}' check (array_position(blocked_features, null) is null),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);
alter table private.org_entitlements enable row level security;
revoke all on private.org_entitlements from public, anon, authenticated;

create function private.org_blocked_features(org uuid) returns text[] language sql stable security definer set search_path = '' as $$
 select coalesce((select e.blocked_features from private.org_entitlements e where e.organization_id = org), '{}')
$$;

create or replace function private.org_has_feature(org uuid, feature text) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce((
  select (s.status = 'trial' or feature = any(p.features))
     and not (feature = any(coalesce((select o.disabled_features from public.organization_settings o where o.organization_id = org), '{}')))
  from public.subscriptions s join public.plans p on p.id = s.plan_id where s.organization_id = org), true)
  -- Not allowed by the platform at all for this organization.
  and not (feature = any(private.org_blocked_features(org)))
$$;

-- my_organizations() gains blocked_features (a new column, so it is dropped and created again).
drop function public.my_organizations();
drop function private.my_organizations();
create function private.my_organizations() returns table(organization_id uuid, name text, type text, role text, access text, status text, ends_on date, days_left integer, plan_key text, features text[], disabled_features text[], primary_color text, accent_color text, display_name text, legal_version text, blocked_features text[])
language sql stable security definer set search_path = '' as $$
 select m.organization_id, o.name, o.type, m.role, private.org_access(m.organization_id), s.status, s.ends_on, s.ends_on - private.riyadh_today(), p.key,
  array(select f from unnest(case when s.status = 'trial' or s.organization_id is null then private.feature_keys() else p.features end) f where not (f = any(private.org_blocked_features(m.organization_id)))),
  coalesce(os.disabled_features, '{}'), os.primary_color, os.accent_color, m.display_name,
  (select a.version from public.legal_acceptances a where a.organization_id = m.organization_id and a.user_id = m.user_id order by a.accepted_at desc limit 1),
  private.org_blocked_features(m.organization_id)
 from public.memberships m join public.organizations o on o.id = m.organization_id
 left join public.subscriptions s on s.organization_id = m.organization_id left join public.plans p on p.id = s.plan_id
 left join public.organization_settings os on os.organization_id = m.organization_id
 where m.user_id = auth.uid()
 order by m.joined_at
$$;
revoke all on function private.my_organizations() from public, anon, authenticated;
grant execute on function private.my_organizations() to authenticated;
create function public.my_organizations() returns table(organization_id uuid, name text, type text, role text, access text, status text, ends_on date, days_left integer, plan_key text, features text[], disabled_features text[], primary_color text, accent_color text, display_name text, legal_version text, blocked_features text[])
language sql stable set search_path = '' as $$ select * from private.my_organizations() $$;
revoke all on function public.my_organizations() from public, anon, authenticated, service_role;
grant execute on function public.my_organizations() to authenticated;

-- 3) Private notes ---------------------------------------------------------------------------------------
create table private.org_admin_notes (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 body text not null default '' check (length(body) <= 4000),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);
alter table private.org_admin_notes enable row level security;
revoke all on private.org_admin_notes from public, anon, authenticated;

-- 4) Cancellation ------------------------------------------------------------------------------------------
alter table public.subscriptions add column cancelled_at timestamptz, add column cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 500);

-- 5) Overview ------------------------------------------------------------------------------------------------
-- Monthly recurring revenue: for each running paid subscription, its latest approved transfer
-- divided by its months (confirmed money only, no list prices).
create function private.admin_overview_v2() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare today date := private.riyadh_today(); day_start timestamptz := (private.riyadh_today()::timestamp at time zone 'Asia/Riyadh');
 base integer; renewed integer; cron jsonb := '[]'::jsonb;
begin
 perform private.require_platform_admin();
 -- Renewals: organizations whose paid period ended in the last 90 days, and of those the ones
 -- that paid again (their subscription now ends after that period).
 select count(*), count(*) filter (where s.ends_on > x.period_end) into base, renewed
 from (select distinct on (p.organization_id) p.organization_id, p.period_end from public.subscription_payments p
   where p.status = 'approved' and p.period_end between today - 90 and today order by p.organization_id, p.period_end) x
 join public.subscriptions s on s.organization_id = x.organization_id;
 -- Scheduled jobs: the last run of each (pg_cron), when the extension is there.
 if to_regclass('cron.job_run_details') is not null then
  execute $q$select coalesce(jsonb_agg(jsonb_build_object('job', j.jobname, 'status', r.status, 'at', r.start_time) order by j.jobname), '[]'::jsonb)
   from cron.job j left join lateral (select d.status, d.start_time from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1) r on true$q$ into cron;
 end if;
 return jsonb_build_object(
  'decisions', jsonb_build_object(
   'payments', (select count(*) from public.subscription_payments x where x.status = 'pending'),
   'oldest_payment', (select jsonb_build_object('organization', o.name, 'created_at', x.created_at) from public.subscription_payments x join public.organizations o on o.id = x.organization_id where x.status = 'pending' order by x.created_at limit 1),
   'join_requests', (select count(*) from private.join_requests r where r.status = 'new'),
   'support_waiting', (select count(*) from public.support_threads t where t.status = 'open' and t.last_sender = 'user'),
   'support_over_24h', (select count(*) from public.support_threads t where t.status = 'open' and t.last_sender = 'user' and t.last_message_at < now() - interval '24 hours'),
   'ending_7_days', (select count(*) from public.subscriptions s where s.status <> 'suspended' and s.ends_on between today and today + 7)),
  'numbers', jsonb_build_object(
   'active', (select count(*) from public.subscriptions s where s.status <> 'trial' and private.org_access(s.organization_id) = 'active'),
   'trial', (select count(*) from public.subscriptions s where s.status = 'trial' and private.org_access(s.organization_id) = 'active'),
   'trial_ending_7_days', (select count(*) from public.subscriptions s where s.status = 'trial' and s.ends_on between today and today + 7),
   'mrr', coalesce((select sum(x.amount / greatest(x.months, 1)) from public.subscriptions s
     join lateral (select p.amount, p.months from public.subscription_payments p where p.organization_id = s.organization_id and p.status = 'approved' order by p.decided_at desc nulls last limit 1) x on true
     where s.status <> 'trial' and private.org_access(s.organization_id) in ('active','grace')), 0),
   'renewal_base', base, 'renewal_rate', case when base > 0 then round(100.0 * renewed / base) end,
   'signed_in_today', (select count(*) from auth.users u where u.last_sign_in_at >= day_start),
   'users', (select count(*) from auth.users u)),
  'health', jsonb_build_object('database', true, 'cron', cron,
   'telegram_links', (select count(*) from private.telegram_links l join private.platform_admins a on a.user_id = l.user_id),
   'telegram_failed_today', (select count(*) from private.telegram_outbox o where o.status = 'failed' and o.created_at > now() - interval '1 day')),
  'activity', coalesce((select jsonb_agg(e order by (e ->> 'at') desc) from (
    (select jsonb_build_object('kind', 'audit', 'action', a.action, 'organization', o.name, 'organization_id', a.organization_id, 'at', a.created_at) as e
      from private.platform_audit a left join public.organizations o on o.id = a.organization_id order by a.created_at desc limit 12)
    union all
    (select jsonb_build_object('kind', 'payment', 'action', 'payment_' || x.status, 'organization', o.name, 'organization_id', x.organization_id, 'at', coalesce(x.decided_at, x.created_at))
      from public.subscription_payments x join public.organizations o on o.id = x.organization_id order by coalesce(x.decided_at, x.created_at) desc limit 8)
    union all
    (select jsonb_build_object('kind', 'join', 'action', 'join_request', 'organization', r.org_name, 'detail', r.city, 'at', r.created_at)
      from private.join_requests r order by r.created_at desc limit 6)
    union all
    (select jsonb_build_object('kind', 'support', 'action', 'support_thread', 'organization', o.name, 'organization_id', t.organization_id, 'detail', t.subject, 'thread', t.id, 'at', t.created_at)
      from public.support_threads t join public.organizations o on o.id = t.organization_id order by t.created_at desc limit 6)
   ) all_events limit 15), '[]'::jsonb));
end $$;

-- 6) Subscribers list ---------------------------------------------------------------------------------------
-- p_status: '' | active | trial | grace | locked | suspended; p_plan: a plan id or null; p_ending: within
-- 14 days; p_sort: ending | newest | name | students; p_page from 1, 25 per page. total is in each row.
create function private.admin_subscribers_v2(p_search text, p_status text, p_plan uuid, p_ending boolean, p_sort text, p_page integer)
returns table(organization_id uuid, name text, type text, city text, plan text, status text, access text, ends_on date, days_left integer, owner_email text, owner_phone text, students bigint, staff bigint, pending bigint, created_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare q text := nullif(btrim(replace(replace(coalesce(p_search, ''), '%', ''), '_', '')), ''); per integer := 25; today date := private.riyadh_today();
begin
 perform private.require_platform_admin();
 return query
 with base as (
  select o.id, o.name, o.type, coalesce(pr.city, (select r.city from private.join_requests r join private.org_invites i on i.id = r.invite_id where i.organization_id = o.id limit 1)) as city,
   p.name as plan_name, s.status, private.org_access(o.id) as access, s.ends_on, s.plan_id, o.created_at,
   (select u.email::text from public.memberships m join auth.users u on u.id = m.user_id where m.organization_id = o.id and m.role = 'owner' order by m.joined_at limit 1) as owner_email,
   (select ph.phone from public.memberships m join public.member_phones ph on ph.user_id = m.user_id and ph.organization_id = o.id where m.organization_id = o.id and m.role = 'owner' limit 1) as owner_phone,
   (select count(*) from public.children c where c.organization_id = o.id and c.status = 'active') as students,
   (select count(*) from public.memberships m where m.organization_id = o.id) as staff,
   (select count(*) from public.subscription_payments x where x.organization_id = o.id and x.status = 'pending') as pending
  from public.organizations o left join public.subscriptions s on s.organization_id = o.id left join public.plans p on p.id = s.plan_id
  left join public.organization_profiles pr on pr.organization_id = o.id
 ), filtered as (
  select b.* from base b
  where (q is null or b.name ilike '%' || q || '%' or coalesce(b.city, '') ilike '%' || q || '%' or coalesce(b.owner_email, '') ilike '%' || q || '%'
         or regexp_replace(coalesce(b.owner_phone, ''), '\D', '', 'g') like '%' || nullif(regexp_replace(q, '\D', '', 'g'), '') || '%')
    and (coalesce(p_status, '') = ''
      or (p_status = 'trial' and b.status = 'trial' and b.access = 'active')
      or (p_status = 'suspended' and b.status = 'suspended')
      or (p_status = 'active' and b.access = 'active' and b.status is distinct from 'trial')
      or (p_status in ('grace','locked') and b.access = p_status and b.status is distinct from 'suspended'))
    and (p_plan is null or b.plan_id = p_plan)
    and (not coalesce(p_ending, false) or (b.ends_on between today and today + 14 and b.status is distinct from 'suspended'))
 )
 select f.id, f.name, f.type, f.city, f.plan_name, f.status, f.access, f.ends_on, f.ends_on - today, f.owner_email, f.owner_phone, f.students, f.staff, f.pending, f.created_at, count(*) over ()
 from filtered f
 order by
  case when p_sort = 'name' then f.name end asc,
  case when p_sort = 'newest' then f.created_at end desc,
  case when p_sort = 'students' then f.students end desc,
  f.ends_on asc nulls last, f.name
 limit per offset (greatest(coalesce(p_page, 1), 1) - 1) * per;
end $$;

-- 7) Organization profile ----------------------------------------------------------------------------------------
create function private.admin_org_profile(org uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare day_start timestamptz := (private.riyadh_today()::timestamp at time zone 'Asia/Riyadh'); setup record;
begin
 perform private.require_platform_admin();
 if not exists (select 1 from public.organizations o where o.id = org) then return null; end if;
 select * into setup from private.admin_onboarding() a where a.organization_id = org;
 return (select jsonb_build_object(
  'organization_id', o.id, 'name', o.name, 'type', o.type, 'created_at', o.created_at,
  'city', coalesce(pr.city, (select r.city from private.join_requests r join private.org_invites i on i.id = r.invite_id where i.organization_id = o.id limit 1)),
  'access', private.org_access(o.id),
  'subscription', (select jsonb_build_object('status', s.status, 'starts_on', s.starts_on, 'ends_on', s.ends_on, 'days_left', s.ends_on - private.riyadh_today(),
     'plan_id', s.plan_id, 'cancelled_at', s.cancelled_at, 'cancel_reason', s.cancel_reason) from public.subscriptions s where s.organization_id = o.id),
  'plan', (select jsonb_build_object('id', p.id, 'name', p.name, 'monthly_price', p.monthly_price, 'features', to_jsonb(p.features)) from public.subscriptions s join public.plans p on p.id = s.plan_id where s.organization_id = o.id),
  'grace_days', coalesce((select ps.grace_days from public.platform_settings ps limit 1), 7),
  'payment_method', (select case when exists (select 1 from public.subscription_payments x where x.organization_id = o.id and x.status = 'approved') then 'bank_transfer' end),
  'payments', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'plan', (select p.name from public.plans p where p.id = x.plan_id), 'months', x.months, 'amount', x.amount, 'reference', x.reference,
     'status', x.status, 'reject_reason', x.reject_reason, 'receipt_path', x.receipt_path, 'created_at', x.created_at, 'decided_at', x.decided_at, 'period_end', x.period_end) order by x.created_at desc)
     from public.subscription_payments x where x.organization_id = o.id), '[]'::jsonb),
  'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', m.display_name, 'role', m.role, 'login', u.email,
     'phone', (select ph.phone from public.member_phones ph where ph.user_id = m.user_id and ph.organization_id = o.id), 'last_sign_in_at', u.last_sign_in_at,
     'locked', (select (private.login_check(lower(u.email), null) ->> 'locked')::boolean)) order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.joined_at)
     from public.memberships m join auth.users u on u.id = m.user_id where m.organization_id = o.id), '[]'::jsonb),
  'counts', jsonb_build_object(
     'staff', (select count(*) from public.memberships m where m.organization_id = o.id and m.role <> 'owner'),
     'signed_in_today', (select count(*) from public.memberships m join auth.users u on u.id = m.user_id where m.organization_id = o.id and u.last_sign_in_at >= day_start),
     'guardians', (select count(*) from public.guardians g where g.organization_id = o.id),
     'students', (select count(*) from public.children c where c.organization_id = o.id and c.status = 'active')),
  'entitlements', jsonb_build_object('blocked', to_jsonb(private.org_blocked_features(o.id)), 'disabled', to_jsonb(coalesce((select os.disabled_features from public.organization_settings os where os.organization_id = o.id), '{}'))),
  'onboarding', case when setup.organization_id is null then null else jsonb_build_object('done', setup.done, 'total', setup.total, 'missing', to_jsonb(setup.missing), 'snooze_count', setup.snooze_count, 'stuck', setup.stuck,
     'completed_at', setup.completed_at,
     'since', (select coalesce(p.updated_at, m.joined_at) from public.memberships m left join public.onboarding_progress p on p.organization_id = m.organization_id and p.user_id = m.user_id
       where m.organization_id = o.id and m.role = 'owner' order by m.joined_at limit 1)) end,
  'support', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'subject', t.subject, 'status', t.status, 'last_sender', t.last_sender, 'last_message_at', t.last_message_at) order by t.last_message_at desc)
     from public.support_threads t where t.organization_id = o.id), '[]'::jsonb),
  'log', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'detail', a.detail, 'created_at', a.created_at) order by a.created_at desc)
     from (select * from private.platform_audit a where a.organization_id = o.id or a.detail ->> 'org' = o.id::text or a.detail ->> 'organization_id' = o.id::text order by a.created_at desc limit 100) a), '[]'::jsonb),
  'note', (select jsonb_build_object('body', n.body, 'updated_at', n.updated_at) from private.org_admin_notes n where n.organization_id = o.id))
  from public.organizations o left join public.organization_profiles pr on pr.organization_id = o.id where o.id = org);
end $$;

create function private.admin_org_extend(org uuid, amount integer, unit text) returns date language plpgsql security definer set search_path = '' as $$
declare new_end date;
begin
 perform private.require_platform_admin();
 if unit = 'months' then new_end := private.admin_extend_months(org, amount);
 elsif unit = 'days' then new_end := private.admin_extend(org, amount);
 else raise exception 'Unit must be days or months' using errcode = '22023'; end if;
 update public.subscriptions s set cancelled_at = null, cancel_reason = null where s.organization_id = org;
 perform private.admin_log(org, 'org_extended', jsonb_build_object('amount', amount, 'unit', unit, 'ends_on', new_end));
 return new_end;
end $$;

create function private.admin_org_free_month(org uuid) returns date language plpgsql security definer set search_path = '' as $$
declare new_end date;
begin
 perform private.require_platform_admin();
 new_end := private.admin_extend_months(org, 1);
 update public.subscriptions s set cancelled_at = null, cancel_reason = null where s.organization_id = org;
 perform private.admin_log(org, 'org_free_month', jsonb_build_object('ends_on', new_end));
 return new_end;
end $$;

create function private.admin_org_set_plan(org uuid, plan uuid) returns void language plpgsql security definer set search_path = '' as $$
declare plan_name text := (select p.name from public.plans p where p.id = plan);
begin
 perform private.require_platform_admin();
 perform private.admin_set_plan(org, plan);
 perform private.notify_owners(org, 'تغيّرت باقة منشأتك', 'الباقة الحالية: ' || coalesce(plan_name, '—'));
 perform private.admin_log(org, 'org_plan_changed', jsonb_build_object('plan', plan, 'name', plan_name));
end $$;

create function private.admin_org_set_suspended(org uuid, suspended boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 if suspended is null then raise exception 'Choose' using errcode = '22023'; end if;
 perform private.admin_set_suspended(org, suspended);
 perform private.admin_log(org, case when suspended then 'org_suspended' else 'org_resumed' end, '{}'::jsonb);
end $$;

-- Cancel: the subscription ends today with no grace (access closes now); data stays; an extension opens it again.
create function private.admin_org_cancel(org uuid, reason text) returns void language plpgsql security definer set search_path = '' as $$
declare grace integer := coalesce((select p.grace_days from public.platform_settings p limit 1), 7); new_end date := private.riyadh_today() - (coalesce((select p.grace_days from public.platform_settings p limit 1), 7) + 1);
begin
 perform private.require_platform_admin();
 if length(btrim(coalesce(reason, ''))) < 3 then raise exception 'Write the reason' using errcode = '22023'; end if;
 update public.subscriptions s set status = case when s.status = 'trial' then 'active' else s.status end, starts_on = least(s.starts_on, new_end), ends_on = new_end,
  cancelled_at = now(), cancel_reason = left(btrim(reason), 500), updated_at = now() where s.organization_id = org;
 if not found then raise exception 'No subscription' using errcode = 'P0002'; end if;
 if (select s.status from public.subscriptions s where s.organization_id = org) = 'suspended' then
  update public.subscriptions s set status = 'active' where s.organization_id = org;
 end if;
 perform private.sync_status(org);
 perform private.audit_subscription(org, 'UPDATE');
 perform private.notify_owners(org, 'تم إلغاء اشتراك المنشأة', left(btrim(reason), 200));
 perform private.admin_log(org, 'org_cancelled', jsonb_build_object('reason', left(btrim(reason), 500), 'grace', grace));
end $$;

-- Unlock a member's sign-in: the recent failures of that login are cleared and its active lock ends.
create function private.admin_unlock_login(org uuid, member uuid) returns void language plpgsql security definer set search_path = '' as $$
declare login_key text;
begin
 perform private.require_platform_admin();
 select lower(u.email) into login_key from public.memberships m join auth.users u on u.id = m.user_id where m.organization_id = org and m.user_id = member;
 if login_key is null then raise exception 'Not a member' using errcode = 'P0002'; end if;
 delete from private.login_attempts a where a.login = login_key and not a.ok and a.created_at > now() - interval '1 hour';
 update private.login_locks l set locked_until = now() where l.scope = 'account' and l.subject = login_key and l.locked_until > now();
 perform private.admin_log(org, 'login_unlocked', jsonb_build_object('member', member, 'login', private.login_mask(login_key)));
end $$;

-- Transfer ownership to another member: they become owner, the current owners become admins. Both notified.
create function private.admin_transfer_ownership(org uuid, new_owner uuid) returns void language plpgsql security definer set search_path = '' as $$
declare old_owners uuid[]; org_name text := (select o.name from public.organizations o where o.id = org); m record; actor text := current_setting('request.jwt.claim.sub', true);
begin
 perform private.require_platform_admin();
 if not exists (select 1 from public.memberships x where x.organization_id = org and x.user_id = new_owner) then raise exception 'Not a member' using errcode = 'P0002'; end if;
 if exists (select 1 from public.memberships x where x.organization_id = org and x.user_id = new_owner and x.role = 'owner') then raise exception 'Already the owner' using errcode = '22023'; end if;
 select array_agg(x.user_id) into old_owners from public.memberships x where x.organization_id = org and x.role = 'owner';
 -- The role guard on memberships lets only an organization's owner change roles; this change is the
 -- platform's (checked above), so it runs as the system for these two updates only.
 perform set_config('request.jwt.claim.sub', '', true);
 update public.memberships x set role = 'admin' where x.organization_id = org and x.role = 'owner';
 update public.memberships x set role = 'owner' where x.organization_id = org and x.user_id = new_owner;
 perform set_config('request.jwt.claim.sub', coalesce(actor, ''), true);
 perform private.notify(org, new_owner, 'member', 'صرت مالك ' || coalesce(org_name, 'المنشأة'), 'نقل فريق سِير ملكية المنشأة لك.', '/dashboard/settings');
 for m in select unnest(coalesce(old_owners, '{}')) as id loop
  perform private.notify(org, m.id, 'member', 'انتقلت ملكية ' || coalesce(org_name, 'المنشأة'), 'صرت مديرًا في المنشأة، والمالك الحين عضو ثاني.', '/dashboard/team');
 end loop;
 perform private.admin_log(org, 'ownership_transferred', jsonb_build_object('to', new_owner, 'from', to_jsonb(old_owners)));
end $$;

create function private.admin_set_entitlements(org uuid, blocked text[]) returns void language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 if not exists (select 1 from public.organizations o where o.id = org) then raise exception 'Unknown organization' using errcode = 'P0002'; end if;
 if not (coalesce(blocked, '{}') <@ private.feature_keys()) then raise exception 'Unknown section' using errcode = '22023'; end if;
 insert into private.org_entitlements(organization_id, blocked_features, updated_by) values (org, coalesce(blocked, '{}'), auth.uid())
 on conflict (organization_id) do update set blocked_features = excluded.blocked_features, updated_by = excluded.updated_by, updated_at = now();
 perform private.admin_log(org, 'entitlements_updated', jsonb_build_object('blocked', to_jsonb(coalesce(blocked, '{}'))));
end $$;

-- «ذكّرهم»: an in-app notification to the owners, and an email when the owner has a real address.
create function private.admin_onboarding_remind(org uuid) returns integer language plpgsql security definer set search_path = '' as $$
declare sent integer := 0; m record; org_name text := (select o.name from public.organizations o where o.id = org);
begin
 perform private.require_platform_admin();
 for m in select x.user_id, u.email from public.memberships x join auth.users u on u.id = x.user_id where x.organization_id = org and x.role = 'owner' loop
  perform private.notify(org, m.user_id, 'onboarding', 'كمّل تجهيز منشأتك', 'باقي خطوات بسيطة. افتح المساعد واكتب «ابدأ الشرح» أو اضغط «كمّل» فوق.', '/dashboard');
  if m.email is not null and m.email not like '%@users.seer.local' then
   insert into private.email_outbox(to_email, subject, body) values (m.email, 'سِير — كمّل تجهيز ' || coalesce(org_name, 'منشأتك'),
    'هلا! باقي خطوات بسيطة لتجهيز ' || coalesce(org_name, 'منشأتك') || ' في سِير. ادخل المنصة واضغط «كمّل» في شريط التجهيز، أو اطلب من المساعد «ابدأ الشرح».');
  end if;
  sent := sent + 1;
 end loop;
 perform private.admin_log(org, 'onboarding_reminded', jsonb_build_object('owners', sent));
 return sent;
end $$;

create function private.admin_save_org_note(org uuid, body text) returns void language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 if not exists (select 1 from public.organizations o where o.id = org) then raise exception 'Unknown organization' using errcode = 'P0002'; end if;
 if length(coalesce(body, '')) > 4000 then raise exception 'Too long' using errcode = '22023'; end if;
 insert into private.org_admin_notes(organization_id, body, updated_by) values (org, coalesce(body, ''), auth.uid())
 on conflict (organization_id) do update set body = excluded.body, updated_by = excluded.updated_by, updated_at = now();
 -- The note's text is not copied into the log.
 perform private.admin_log(org, 'note_saved', jsonb_build_object('length', length(coalesce(body, ''))));
end $$;

-- Grants: platform admins (checked inside) call the public wrappers.
revoke all on function private.admin_log(uuid,text,jsonb), private.org_blocked_features(uuid), private.admin_overview_v2(), private.admin_subscribers_v2(text,text,uuid,boolean,text,integer),
 private.admin_org_profile(uuid), private.admin_org_extend(uuid,integer,text), private.admin_org_free_month(uuid), private.admin_org_set_plan(uuid,uuid), private.admin_org_set_suspended(uuid,boolean),
 private.admin_org_cancel(uuid,text), private.admin_unlock_login(uuid,uuid), private.admin_transfer_ownership(uuid,uuid), private.admin_set_entitlements(uuid,text[]), private.admin_onboarding_remind(uuid),
 private.admin_save_org_note(uuid,text) from public, anon, authenticated;
grant execute on function private.org_blocked_features(uuid) to anon, authenticated;
grant execute on function private.admin_overview_v2(), private.admin_subscribers_v2(text,text,uuid,boolean,text,integer), private.admin_org_profile(uuid), private.admin_org_extend(uuid,integer,text),
 private.admin_org_free_month(uuid), private.admin_org_set_plan(uuid,uuid), private.admin_org_set_suspended(uuid,boolean), private.admin_org_cancel(uuid,text), private.admin_unlock_login(uuid,uuid),
 private.admin_transfer_ownership(uuid,uuid), private.admin_set_entitlements(uuid,text[]), private.admin_onboarding_remind(uuid), private.admin_save_org_note(uuid,text) to authenticated;

create function public.admin_overview_v2() returns jsonb language sql stable set search_path = '' as $$ select private.admin_overview_v2() $$;
create function public.admin_subscribers_v2(p_search text default null, p_status text default null, p_plan uuid default null, p_ending boolean default false, p_sort text default 'ending', p_page integer default 1)
 returns table(organization_id uuid, name text, type text, city text, plan text, status text, access text, ends_on date, days_left integer, owner_email text, owner_phone text, students bigint, staff bigint, pending bigint, created_at timestamptz, total bigint)
 language sql stable set search_path = '' as $$ select * from private.admin_subscribers_v2(p_search, p_status, p_plan, p_ending, p_sort, p_page) $$;
create function public.admin_org_profile(org uuid) returns jsonb language sql stable set search_path = '' as $$ select private.admin_org_profile(org) $$;
create function public.admin_org_extend(org uuid, amount integer, unit text) returns date language sql set search_path = '' as $$ select private.admin_org_extend(org, amount, unit) $$;
create function public.admin_org_free_month(org uuid) returns date language sql set search_path = '' as $$ select private.admin_org_free_month(org) $$;
create function public.admin_org_set_plan(org uuid, plan uuid) returns void language sql set search_path = '' as $$ select private.admin_org_set_plan(org, plan) $$;
create function public.admin_org_set_suspended(org uuid, suspended boolean) returns void language sql set search_path = '' as $$ select private.admin_org_set_suspended(org, suspended) $$;
create function public.admin_org_cancel(org uuid, reason text) returns void language sql set search_path = '' as $$ select private.admin_org_cancel(org, reason) $$;
create function public.admin_unlock_login(org uuid, member uuid) returns void language sql set search_path = '' as $$ select private.admin_unlock_login(org, member) $$;
create function public.admin_transfer_ownership(org uuid, new_owner uuid) returns void language sql set search_path = '' as $$ select private.admin_transfer_ownership(org, new_owner) $$;
create function public.admin_set_entitlements(org uuid, blocked text[]) returns void language sql set search_path = '' as $$ select private.admin_set_entitlements(org, blocked) $$;
create function public.admin_onboarding_remind(org uuid) returns integer language sql set search_path = '' as $$ select private.admin_onboarding_remind(org) $$;
create function public.admin_save_org_note(org uuid, body text) returns void language sql set search_path = '' as $$ select private.admin_save_org_note(org, body) $$;
revoke all on function public.admin_overview_v2(), public.admin_subscribers_v2(text,text,uuid,boolean,text,integer), public.admin_org_profile(uuid), public.admin_org_extend(uuid,integer,text),
 public.admin_org_free_month(uuid), public.admin_org_set_plan(uuid,uuid), public.admin_org_set_suspended(uuid,boolean), public.admin_org_cancel(uuid,text), public.admin_unlock_login(uuid,uuid),
 public.admin_transfer_ownership(uuid,uuid), public.admin_set_entitlements(uuid,text[]), public.admin_onboarding_remind(uuid), public.admin_save_org_note(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.admin_overview_v2(), public.admin_subscribers_v2(text,text,uuid,boolean,text,integer), public.admin_org_profile(uuid), public.admin_org_extend(uuid,integer,text),
 public.admin_org_free_month(uuid), public.admin_org_set_plan(uuid,uuid), public.admin_org_set_suspended(uuid,boolean), public.admin_org_cancel(uuid,text), public.admin_unlock_login(uuid,uuid),
 public.admin_transfer_ownership(uuid,uuid), public.admin_set_entitlements(uuid,text[]), public.admin_onboarding_remind(uuid), public.admin_save_org_note(uuid,text) to authenticated;
commit;
