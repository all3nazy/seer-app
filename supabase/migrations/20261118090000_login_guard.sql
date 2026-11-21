-- Login guard: brute-force protection for password sign-in, done by the app server before it asks
-- Supabase Auth, and Telegram alerts for the platform admins.
-- 1) private.login_attempts: every password sign-in (login normalised to lowercase, client IP,
--    success or not, user agent). private.login_locks: one row each time a lock starts.
-- 2) private.login_check(login, ip): is the account or the IP locked, and for how long.
--    Account: 5 failures within 15 minutes (after its last success) → locked until 15 minutes
--    after the latest failure. IP: 15 failures within 15 minutes (schools share one IP) → locked
--    until 30 minutes after the latest failure. Locked attempts never reach Supabase Auth.
-- 3) private.login_record(login, ip, ok, user_agent): records the attempt and, when a lock starts,
--    alerts the platform admins on Telegram (masked account, organization, IP, count, unlock time).
--    Also: one IP failing 40 times in an hour (wide guessing), and one IP failing on 5+ different
--    accounts in 15 minutes (credential stuffing); each alerts at most once an hour.
-- 4) private.login_security_summary(): locks of the last 24 hours and the IPs failing most, for the
--    admin console.
-- 5) Retention: attempts and locks older than 30 days are deleted by the existing daily job
--    (private.subscription_daily, copied unchanged with the deletes added at the end).
-- Server only: execute for service_role only (private functions and their public wrappers, as
-- telegram_claim_kick). Forward-only.
begin;

-- 1) Tables -----------------------------------------------------------------------------------------
create table private.login_attempts (
 id bigserial primary key,
 login text not null check (login = lower(btrim(login)) and length(login) between 1 and 254),
 ip text check (ip is null or length(ip) <= 64),
 ok boolean not null,
 user_agent text check (user_agent is null or length(user_agent) <= 300),
 created_at timestamptz not null default now()
);
create index login_attempts_login_idx on private.login_attempts(login, created_at desc);
create index login_attempts_ip_idx on private.login_attempts(ip, created_at desc);
alter table private.login_attempts enable row level security;
revoke all on private.login_attempts from public, anon, authenticated;

create table private.login_locks (
 id bigserial primary key,
 scope text not null check (scope in ('account','ip')),
 subject text not null check (length(subject) between 1 and 254),
 ip text check (ip is null or length(ip) <= 64),
 failures integer not null,
 locked_until timestamptz not null,
 created_at timestamptz not null default now()
);
create index login_locks_subject_idx on private.login_locks(scope, subject, created_at desc);
create index login_locks_created_idx on private.login_locks(created_at desc);
alter table private.login_locks enable row level security;
revoke all on private.login_locks from public, anon, authenticated;

-- 2) Is it locked? ----------------------------------------------------------------------------------
-- The failure burst is counted in the 15 minutes up to the latest failure, so the lock lasts a
-- fixed time after that latest failure.
create function private.login_account_lock(p_login text) returns timestamptz language sql stable security definer set search_path = '' as $$
 with since as (select coalesce(max(a.created_at), '-infinity'::timestamptz) as at from private.login_attempts a where a.login = p_login and a.ok),
 latest as (select max(a.created_at) as at from private.login_attempts a, since where a.login = p_login and not a.ok and a.created_at > since.at)
 select latest.at + interval '15 minutes' from latest, since
 where latest.at is not null
   and (select count(*) from private.login_attempts a where a.login = p_login and not a.ok and a.created_at > since.at and a.created_at > latest.at - interval '15 minutes') >= 5
$$;
create function private.login_ip_lock(p_ip text) returns timestamptz language sql stable security definer set search_path = '' as $$
 with latest as (select max(a.created_at) as at from private.login_attempts a where a.ip = p_ip and not a.ok and a.created_at > now() - interval '45 minutes')
 select latest.at + interval '30 minutes' from latest
 where latest.at is not null
   and (select count(*) from private.login_attempts a where a.ip = p_ip and not a.ok and a.created_at > latest.at - interval '15 minutes') >= 15
$$;

-- {locked, scope: 'account' | 'ip' | null, retry_after_seconds}
create function private.login_check(p_login text, p_ip text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare account_until timestamptz; ip_until timestamptz; login_key text := lower(btrim(coalesce(p_login, '')));
begin
 if login_key <> '' then account_until := private.login_account_lock(login_key); end if;
 if nullif(btrim(coalesce(p_ip, '')), '') is not null then ip_until := private.login_ip_lock(btrim(p_ip)); end if;
 if account_until <= now() then account_until := null; end if;
 if ip_until <= now() then ip_until := null; end if;
 if account_until is null and ip_until is null then return jsonb_build_object('locked', false, 'scope', null, 'retry_after_seconds', 0); end if;
 -- Both: the one that lasts longer.
 if ip_until is not null and (account_until is null or ip_until >= account_until) then
  return jsonb_build_object('locked', true, 'scope', 'ip', 'retry_after_seconds', ceil(extract(epoch from ip_until - now()))::integer);
 end if;
 return jsonb_build_object('locked', true, 'scope', 'account', 'retry_after_seconds', ceil(extract(epoch from account_until - now()))::integer);
end $$;

-- 3) Record and alert --------------------------------------------------------------------------------
-- ab***@domain (usernames sign in as <name>@users.seer.local).
create function private.login_mask(p_login text) returns text language sql immutable set search_path = '' as $$
 select case when position('@' in p_login) > 1
  then left(split_part(p_login, '@', 1), 2) || '***@' || split_part(p_login, '@', 2)
  else left(p_login, 2) || '***' end
$$;

-- The organizations a login belongs to (members only), for the alert.
create function private.login_organizations(p_login text) returns text language sql stable security definer set search_path = '' as $$
 select string_agg(distinct o.name, '، ') from auth.users u
 join public.memberships m on m.user_id = u.id join public.organizations o on o.id = m.organization_id
 where lower(u.email) = p_login
$$;

create function private.login_riyadh_time(at timestamptz) returns text language sql stable set search_path = '' as $$
 select to_char(at at time zone 'Asia/Riyadh', 'HH24:MI') || ' بتوقيت الرياض'
$$;

create function private.login_record(p_login text, p_ip text, p_ok boolean, p_user_agent text) returns void language plpgsql security definer set search_path = '' as $$
declare
 login_key text := lower(btrim(coalesce(p_login, '')));
 client_ip text := nullif(left(btrim(coalesce(p_ip, '')), 64), '');
 until timestamptz; n integer; lock_id bigint; org text;
 buttons jsonb := jsonb_build_array(jsonb_build_object('text', 'أمان الدخول', 'url', '/admin#login-security'));
begin
 if login_key = '' or p_ok is null then return; end if;
 insert into private.login_attempts(login, ip, ok, user_agent) values (left(login_key, 254), client_ip, p_ok, nullif(left(coalesce(p_user_agent, ''), 300), ''));
 if p_ok then return; end if;

 -- The account lock starts now: once per lock (a new lock row), then alert.
 until := private.login_account_lock(login_key);
 if until is not null and until > now() and not exists (
  select 1 from private.login_locks l where l.scope = 'account' and l.subject = login_key and l.locked_until > now() - interval '15 minutes' and l.created_at > now() - interval '15 minutes') then
  select count(*) into n from private.login_attempts a where a.login = login_key and not a.ok and a.created_at > now() - interval '15 minutes';
  insert into private.login_locks(scope, subject, ip, failures, locked_until) values ('account', login_key, client_ip, n, until) returning id into lock_id;
  org := private.login_organizations(login_key);
  perform private.telegram_alert_once('login-lock:account:' || login_key || ':' || lock_id,
   '🔒 قفل حساب مؤقت' || chr(10) ||
   'الحساب: ' || private.login_mask(login_key) || chr(10) ||
   coalesce('المنشأة: ' || org || chr(10), '') ||
   'IP: ' || coalesce(client_ip, 'غير معروف') || chr(10) ||
   'المحاولات الفاشلة: ' || n || ' خلال ١٥ دقيقة' || chr(10) ||
   'يفك القفل: ' || private.login_riyadh_time(until), buttons);
 end if;

 if client_ip is null then return; end if;
 -- The IP lock starts now.
 until := private.login_ip_lock(client_ip);
 if until is not null and until > now() and not exists (
  select 1 from private.login_locks l where l.scope = 'ip' and l.subject = client_ip and l.created_at > now() - interval '30 minutes') then
  select count(*) into n from private.login_attempts a where a.ip = client_ip and not a.ok and a.created_at > now() - interval '15 minutes';
  insert into private.login_locks(scope, subject, ip, failures, locked_until) values ('ip', client_ip, client_ip, n, until) returning id into lock_id;
  perform private.telegram_alert_once('login-lock:ip:' || client_ip || ':' || lock_id,
   '🔒 قفل IP مؤقت' || chr(10) ||
   'IP: ' || client_ip || chr(10) ||
   'المحاولات الفاشلة: ' || n || ' خلال ١٥ دقيقة على ' ||
    (select count(distinct a.login) from private.login_attempts a where a.ip = client_ip and not a.ok and a.created_at > now() - interval '15 minutes') || ' حساب' || chr(10) ||
   'آخر حساب: ' || private.login_mask(login_key) || chr(10) ||
   'يفك القفل: ' || private.login_riyadh_time(until), buttons);
 end if;

 -- Wide guessing: 40 failures from one IP in an hour (at most once an hour).
 select count(*) into n from private.login_attempts a where a.ip = client_ip and not a.ok and a.created_at > now() - interval '1 hour';
 if n >= 40 then
  perform private.telegram_alert_once('login-wide:' || client_ip,
   '🚨 تخمين واسع على الدخول' || chr(10) || 'IP: ' || client_ip || chr(10) || 'المحاولات الفاشلة: ' || n || ' خلال ساعة', buttons);
 end if;
 -- Credential stuffing: one IP failing on 5 or more different accounts in 15 minutes (once an hour).
 select count(distinct a.login) into n from private.login_attempts a where a.ip = client_ip and not a.ok and a.created_at > now() - interval '15 minutes';
 if n >= 5 then
  perform private.telegram_alert_once('login-stuffing:' || client_ip,
   '🚨 محاولات على حسابات كثيرة (حشو بيانات دخول)' || chr(10) || 'IP: ' || client_ip || chr(10) || 'الحسابات المختلفة: ' || n || ' خلال ١٥ دقيقة', buttons);
 end if;
end $$;

-- 4) For the admin console (read by the server with the service role) -------------------------------
create function private.login_security_summary() returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
  'locks', coalesce((select jsonb_agg(jsonb_build_object('scope', l.scope, 'subject', case when l.scope = 'account' then private.login_mask(l.subject) else l.subject end,
    'ip', l.ip, 'failures', l.failures, 'locked_until', l.locked_until, 'created_at', l.created_at, 'active', l.locked_until > now()) order by l.created_at desc)
   from (select * from private.login_locks x where x.created_at > now() - interval '24 hours' order by x.created_at desc limit 50) l), '[]'::jsonb),
  'top_ips', coalesce((select jsonb_agg(jsonb_build_object('ip', t.ip, 'failures', t.failures, 'accounts', t.accounts, 'last_at', t.last_at) order by t.failures desc)
   from (select a.ip, count(*)::integer as failures, count(distinct a.login)::integer as accounts, max(a.created_at) as last_at from private.login_attempts a
    where not a.ok and a.ip is not null and a.created_at > now() - interval '24 hours' group by a.ip order by count(*) desc limit 10) t), '[]'::jsonb),
  'failures_24h', (select count(*) from private.login_attempts a where not a.ok and a.created_at > now() - interval '24 hours'),
  'successes_24h', (select count(*) from private.login_attempts a where a.ok and a.created_at > now() - interval '24 hours'))
$$;

-- 5) Retention in the existing daily job (03:00 UTC): the body of private.subscription_daily is
-- unchanged; only the two deletes at the end are new.
create or replace function private.subscription_daily() returns integer language plpgsql security definer set search_path = '' as $$
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
 -- Login guard retention: 30 days.
 delete from private.login_attempts where created_at < now() - interval '30 days';
 delete from private.login_locks where created_at < now() - interval '30 days';
 return sent;
end $$;

-- Grants: the app server (service role) only.
revoke all on function private.login_account_lock(text), private.login_ip_lock(text), private.login_check(text,text), private.login_mask(text),
 private.login_organizations(text), private.login_riyadh_time(timestamptz), private.login_record(text,text,boolean,text), private.login_security_summary()
 from public, anon, authenticated;
grant execute on function private.login_check(text,text), private.login_record(text,text,boolean,text), private.login_security_summary() to service_role;

create function public.login_check(p_login text, p_ip text) returns jsonb language sql stable set search_path = '' as $$ select private.login_check(p_login, p_ip) $$;
create function public.login_record(p_login text, p_ip text, p_ok boolean, p_user_agent text) returns void language sql set search_path = '' as $$ select private.login_record(p_login, p_ip, p_ok, p_user_agent) $$;
create function public.login_security_summary() returns jsonb language sql stable set search_path = '' as $$ select private.login_security_summary() $$;
revoke all on function public.login_check(text,text), public.login_record(text,text,boolean,text), public.login_security_summary() from public, anon, authenticated, service_role;
grant execute on function public.login_check(text,text), public.login_record(text,text,boolean,text), public.login_security_summary() to service_role;
commit;
