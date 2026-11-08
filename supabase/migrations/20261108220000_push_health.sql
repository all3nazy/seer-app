-- Push notifications without shared secrets, and the system health tool.
-- 1) Push: the push keys are generated once by the app server and kept in the database (never
--    readable by clients). Each push is a one-time job claimed by the server with a single-use code.
-- 2) Health: errors from browsers and the server are recorded (private details masked) and grouped;
--    managers run checks and safe repairs; safe repairs also run every 15 minutes; a fix written for
--    an error is kept and shown when it happens again, and a resolved error that recurs is reopened.
-- Forward-only.
begin;

-- 1) Push notifications ---------------------------------------------------------------------------
create table private.push_keys (
 id boolean primary key default true check (id),
 public_key text not null check (length(public_key) between 40 and 200),
 private_key text not null check (length(private_key) between 20 and 200),
 created_at timestamptz not null default now()
);
create table private.push_bootstrap (token text primary key check (length(token) >= 32), created_at timestamptz not null default now());
create table private.push_jobs (nonce text primary key, payload jsonb not null, created_at timestamptz not null default now());
alter table private.push_keys enable row level security;
alter table private.push_bootstrap enable row level security;
alter table private.push_jobs enable row level security;
revoke all on private.push_keys, private.push_bootstrap, private.push_jobs from public,anon,authenticated;
alter table private.push_config alter column secret drop not null;

-- The app server stores its freshly generated keys once, with a single-use bootstrap token.
create function private.init_push_keys(token text, public_key text, private_key text) returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if exists (select 1 from private.push_keys) then return false; end if;
 delete from private.push_bootstrap b where b.token = init_push_keys.token and b.created_at > now() - interval '1 day';
 if not found then raise exception 'Invalid token' using errcode = '42501'; end if;
 insert into private.push_keys(public_key, private_key) values (init_push_keys.public_key, init_push_keys.private_key);
 return true;
end $$;
create function private.push_public_key() returns text language sql stable security definer set search_path = '' as $$
 select k.public_key from private.push_keys k
$$;
-- One claim per job, within five minutes; returns what the server needs to send it.
create function private.claim_push_job(nonce text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare job jsonb;
begin
 delete from private.push_jobs j where j.nonce = claim_push_job.nonce and j.created_at > now() - interval '5 minutes' returning j.payload into job;
 if job is null then return null; end if;
 return job || (select jsonb_build_object('public_key', k.public_key, 'private_key', k.private_key) from private.push_keys k);
end $$;
revoke all on function private.init_push_keys(text,text,text), private.push_public_key(), private.claim_push_job(text) from public,anon,authenticated;
grant execute on function private.init_push_keys(text,text,text), private.claim_push_job(text) to anon, authenticated;
grant execute on function private.push_public_key() to authenticated;
create function public.init_push_keys(token text, public_key text, private_key text) returns boolean language sql set search_path = '' as $$ select private.init_push_keys(token, public_key, private_key) $$;
create function public.push_public_key() returns text language sql stable set search_path = '' as $$ select private.push_public_key() $$;
create function public.claim_push_job(nonce text) returns jsonb language sql set search_path = '' as $$ select private.claim_push_job(nonce) $$;
revoke all on function public.init_push_keys(text,text,text), public.push_public_key(), public.claim_push_job(text) from public,anon,authenticated,service_role;
grant execute on function public.init_push_keys(text,text,text), public.claim_push_job(text) to anon, authenticated;
grant execute on function public.push_public_key() to authenticated;

create or replace function private.notify(org uuid, member uuid, kind text, title text, body text, url text) returns void language plpgsql security definer set search_path = '' as $$
declare target text; subs jsonb; code text;
begin
 if member is null or member = auth.uid() then return; end if;
 insert into public.notifications(organization_id,user_id,kind,title,body,url) values (org,member,kind,left(title,120),left(body,300),url);
 -- The push is best effort in its own block: if it fails, the in-app notification above is kept.
 begin
  select c.endpoint into target from private.push_config c limit 1;
  if target is null or not exists (select 1 from private.push_keys) then return; end if;
  select jsonb_agg(jsonb_build_object('endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)) into subs from public.push_subscriptions s where s.user_id = member;
  if subs is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return; end if;
  delete from private.push_jobs j where j.created_at < now() - interval '10 minutes';
  code := private.random_code(43, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789');
  insert into private.push_jobs(nonce, payload) values (code, jsonb_build_object('subscriptions',subs,'title',left(title,120),'body',left(body,300),'url',url));
  execute 'select net.http_post($1, $2, ''{}''::jsonb, $3, 5000)' using target, jsonb_build_object('nonce', code), '{"Content-Type":"application/json"}'::jsonb;
 exception when others then
  return;
 end;
end $$;

-- 2) System health: errors are recorded, checks run on demand, safe repairs run on demand and every
--    15 minutes, and what was learned about an error (its fix) is kept and shown when it recurs.
create table private.platform_admins (user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
alter table private.platform_admins enable row level security;
revoke all on private.platform_admins from public,anon,authenticated;
create function private.is_platform_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from private.platform_admins a where a.user_id = auth.uid())
$$;
revoke all on function private.is_platform_admin() from public,anon,authenticated;
grant execute on function private.is_platform_admin() to authenticated;

create table public.system_errors (
 fingerprint text primary key check (length(fingerprint) = 32),
 kind text not null check (kind in ('client','server','action','route')),
 message text not null check (length(message) between 1 and 500),
 route text check (route is null or length(route) <= 200),
 detail text check (detail is null or length(detail) <= 2000),
 organization_id uuid references public.organizations(id) on delete set null,
 count integer not null default 1,
 first_seen timestamptz not null default now(),
 last_seen timestamptz not null default now(),
 status text not null default 'new' check (status in ('new','known','resolved','ignored')),
 resolution text check (resolution is null or length(resolution) <= 1000),
 resolved_by uuid references auth.users(id) on delete set null,
 resolved_at timestamptz,
 regressed boolean not null default false
);
create index system_errors_recent_idx on public.system_errors(last_seen desc);
alter table public.system_errors enable row level security;
revoke all on public.system_errors from public,anon,authenticated;
grant select on public.system_errors to authenticated;
grant update(status,resolution) on public.system_errors to authenticated;
create policy system_errors_read on public.system_errors for select to authenticated
 using (private.is_platform_admin() or (organization_id is not null and private.can_manage_org(organization_id)));
create policy system_errors_update on public.system_errors for update to authenticated
 using (private.is_platform_admin() or (organization_id is not null and private.can_manage_org(organization_id)))
 with check (private.is_platform_admin() or (organization_id is not null and private.can_manage_org(organization_id)));
create function private.stamp_system_error() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status is distinct from old.status and new.status in ('resolved','known','ignored') then new.resolved_by := auth.uid(); new.resolved_at := now(); new.regressed := false; end if;
 return new;
end $$;
revoke all on function private.stamp_system_error() from public,anon,authenticated;
create trigger stamp_system_error before update on public.system_errors for each row execute function private.stamp_system_error();

-- Private data never enters the log: ids, tokens, emails and long numbers are masked.
create function private.mask_text(value text) returns text language sql immutable set search_path = '' as $$
 select regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(value,''),
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g'),
  '[^@\s]+@[^@\s]+', ':email', 'g'),
  '/(s|j)/[A-Za-z0-9]{8,}', '/\1/:code', 'g'),
  '[0-9]{7,}', '#', 'g')
$$;
revoke all on function private.mask_text(text) from public,anon,authenticated;

-- Records an error once per kind (fingerprint) and counts repeats. A resolved error that comes back
-- is reopened and flagged as a regression. Returns the known fix, if one was written.
create function private.log_error(kind text, message text, route text, detail text, org uuid) returns text language plpgsql security definer set search_path = '' as $$
declare msg text := left(private.mask_text(message), 500); path text := left(private.mask_text(split_part(coalesce(route,''), '?', 1)), 200);
 fp text; known text; scoped uuid := case when org is not null and private.is_org_member(org) then org end;
begin
 if kind not in ('client','server','action','route') or length(btrim(msg)) = 0 then return null; end if;
 fp := md5(kind || '|' || regexp_replace(msg, '[0-9]+', 'N', 'g') || '|' || path);
 select case when e.status in ('known','resolved') then e.resolution end into known from public.system_errors e where e.fingerprint = fp;
 update public.system_errors e set count = e.count + 1, last_seen = now(), organization_id = coalesce(e.organization_id, scoped),
  status = case when e.status = 'resolved' then 'new' else e.status end, regressed = e.regressed or e.status = 'resolved'
 where e.fingerprint = fp;
 if found then return known; end if;
 if (select count(*) from public.system_errors e where e.first_seen > now() - interval '1 hour') >= 200 then return null; end if;
 insert into public.system_errors(fingerprint,kind,message,route,detail,organization_id) values (fp, kind, msg, nullif(path,''), left(private.mask_text(detail), 2000), scoped)
 on conflict (fingerprint) do update set count = public.system_errors.count + 1, last_seen = now();
 return null;
end $$;
revoke all on function private.log_error(text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function private.log_error(text,text,text,text,uuid) to anon, authenticated;
create function public.log_error(kind text, message text, route text default null, detail text default null, org uuid default null) returns text language sql set search_path = '' as $$ select private.log_error(kind, message, route, detail, org) $$;
revoke all on function public.log_error(text,text,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.log_error(text,text,text,text,uuid) to anon, authenticated;

create table private.system_repairs (
 id bigint generated always as identity primary key,
 organization_id uuid references public.organizations(id) on delete cascade,
 check_id text not null,
 fixed integer not null,
 automatic boolean not null default false,
 actor_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
alter table private.system_repairs enable row level security;
revoke all on private.system_repairs from public,anon,authenticated;

-- The checks: each says whether something needs attention, how many, and if it can be repaired.
create function private.system_health(org uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Riyadh')::date; out jsonb := '[]'::jsonb;
begin
 if not private.can_manage_org(org) then raise exception 'Not allowed' using errcode = '42501'; end if;
 out := jsonb_build_array(
  jsonb_build_object('id','messages_stuck','label','رسائل عالقة أثناء الإرسال','fixable',true,'href','/dashboard/messages',
   'count',(select count(*) from public.message_outbox m where m.organization_id = org and m.status = 'sending' and coalesce(m.claimed_at, m.created_at) < now() - interval '10 minutes'),
   'hint','ترجع لقائمة الانتظار وتنرسل من جديد.'),
  jsonb_build_object('id','messages_failed','label','رسائل تعذّر إرسالها (آخر ٣ أيام)','fixable',false,'href','/dashboard/messages',
   'count',(select count(*) from public.message_outbox m where m.organization_id = org and m.status = 'failed' and m.created_at > now() - interval '3 days'),
   'hint','راجع رقم الجوال أو إعدادات مزوّد الرسائل، ثم «إعادة» من صفحة الرسائل.'),
  jsonb_build_object('id','messages_waiting','label','رسائل تنتظر أكثر من يوم','fixable',false,'href','/dashboard/messages',
   'count',(select count(*) from public.message_outbox m where m.organization_id = org and m.status = 'queued' and m.created_at < now() - interval '1 day'),
   'hint','أرسلها بضغطة من صفحة الرسائل، أو فعّل مزوّد الرسائل للإرسال التلقائي.'),
  jsonb_build_object('id','payments_stale','label','محاولات دفع معلّقة أكثر من يوم','fixable',true,'href','/dashboard/finance/online',
   'count',(select count(*) from public.payment_intents p where p.organization_id = org and p.status = 'initiated' and p.created_at < now() - interval '1 day'),
   'hint','تنتهي تلقائيًا؛ ما تأثر على الفواتير.'),
  jsonb_build_object('id','payments_review','label','دفعات تحتاج مراجعة','fixable',false,'href','/dashboard/finance/online',
   'count',(select count(*) from public.payment_intents p where p.organization_id = org and p.status = 'needs_review'),
   'hint','دُفع مبلغ ولم يُسجّل تلقائيًا؛ راجع السبب في صفحة الدفع الإلكتروني.'),
  jsonb_build_object('id','invoice_balance','label','فواتير مجموع مدفوعاتها لا يطابق المسجّل','fixable',false,'href','/dashboard/finance',
   'count',(select count(*) from public.invoices i where i.organization_id = org and i.paid_total <> coalesce((select sum(p.amount) from public.payments p where p.invoice_id = i.id),0)),
   'hint','يُفترض أن يكون صفرًا دائمًا؛ إذا ظهر رقم تواصل مع الدعم.'),
  jsonb_build_object('id','children_no_guardian','label','طلاب بدون ولي أمر','fixable',false,'href','/dashboard/children',
   'count',(select count(*) from public.children c where c.organization_id = org and c.status = 'active' and not exists (select 1 from public.child_guardians g where g.child_id = c.id)),
   'hint','بدون ولي أمر ما توصل رسائل الغياب والتسليم ولا رابط البوابة.'),
  jsonb_build_object('id','children_no_section','label','طلاب بدون فصل','fixable',false,'href','/dashboard/children?section=none',
   'count',(select count(*) from public.children c where c.organization_id = org and c.status = 'active' and c.section_id is null),
   'hint','ما يظهرون في الحضور اليومي والدرجات حتى يُسندون لفصل.'),
  jsonb_build_object('id','guardians_no_phone','label','أولياء أمور بدون جوال','fixable',false,'href','/dashboard/operations?entity=guardians',
   'count',(select count(*) from public.guardians g where g.organization_id = org and (g.phone is null or g.phone = '')),
   'hint','ما توصلهم الرسائل التلقائية.'),
  jsonb_build_object('id','staff_unlinked','label','ملفات موظفين غير مربوطة بحساب','fixable',false,'href','/dashboard/staff',
   'count',(select count(*) from public.staff_profiles s where s.organization_id = org and s.status = 'active' and s.user_id is null),
   'hint','بدون ربط ما يقدر الموظف يسجّل حضوره أو يطلب إجازة.'),
  jsonb_build_object('id','errors_new','label','أخطاء جديدة في المنصة (آخر ٢٤ ساعة)','fixable',false,'href','/dashboard/health#errors',
   'count',(select count(*) from public.system_errors e where e.status = 'new' and e.last_seen > now() - interval '1 day' and (e.organization_id = org or (e.organization_id is null and private.is_platform_admin()))),
   'hint','راجعها في سجل الأخطاء، واكتب الحل؛ يتذكّره النظام ويعرضه إذا تكرر.')
 );
 return out;
end $$;

-- Safe repairs only: nothing here deletes school data or changes money.
create function private.repair_check(org uuid, check_id text, automatic boolean) returns integer language plpgsql security definer set search_path = '' as $$
declare fixed integer := 0;
begin
 if check_id = 'messages_stuck' then
  update public.message_outbox m set status = 'queued' where m.organization_id = org and m.status = 'sending' and coalesce(m.claimed_at, m.created_at) < now() - interval '10 minutes';
  get diagnostics fixed = row_count;
 elsif check_id = 'payments_stale' then
  update public.payment_intents p set status = 'expired', completed_at = now() where p.organization_id = org and p.status = 'initiated' and p.created_at < now() - interval '1 day';
  get diagnostics fixed = row_count;
 else
  raise exception 'This check cannot be repaired automatically' using errcode = '22023';
 end if;
 if fixed > 0 then
  insert into private.system_repairs(organization_id,check_id,fixed,automatic,actor_id) values (org,check_id,fixed,automatic,auth.uid());
 end if;
 return fixed;
end $$;
create function private.system_repair(org uuid, check_id text) returns integer language plpgsql security definer set search_path = '' as $$
begin
 if not private.can_manage_org(org) then raise exception 'Not allowed' using errcode = '42501'; end if;
 return private.repair_check(org, check_id, false);
end $$;
create function private.list_repairs(org uuid) returns table(check_id text, fixed integer, automatic boolean, created_at timestamptz) language sql stable security definer set search_path = '' as $$
 select r.check_id, r.fixed, r.automatic, r.created_at from private.system_repairs r where r.organization_id = org and private.can_manage_org(org) order by r.created_at desc limit 30
$$;
-- Every 15 minutes (pg_cron): safe repairs for every school, and housekeeping.
create function private.self_heal() returns integer language plpgsql security definer set search_path = '' as $$
declare o record; total integer := 0;
begin
 for o in select id from public.organizations loop
  total := total + private.repair_check(o.id, 'messages_stuck', true) + private.repair_check(o.id, 'payments_stale', true);
 end loop;
 delete from private.push_jobs where created_at < now() - interval '10 minutes';
 delete from public.notifications where read_at is not null and created_at < now() - interval '120 days';
 delete from public.system_errors where status in ('resolved','ignored') and last_seen < now() - interval '180 days';
 return total;
end $$;
revoke all on function private.system_health(uuid), private.repair_check(uuid,text,boolean), private.system_repair(uuid,text), private.list_repairs(uuid), private.self_heal() from public,anon,authenticated;
grant execute on function private.system_health(uuid), private.system_repair(uuid,text), private.list_repairs(uuid) to authenticated;
create function public.system_health(org uuid) returns jsonb language sql stable set search_path = '' as $$ select private.system_health(org) $$;
create function public.system_repair(org uuid, check_id text) returns integer language sql set search_path = '' as $$ select private.system_repair(org, check_id) $$;
create function public.list_repairs(org uuid) returns table(check_id text, fixed integer, automatic boolean, created_at timestamptz) language sql stable set search_path = '' as $$ select * from private.list_repairs(org) $$;
revoke all on function public.system_health(uuid), public.system_repair(uuid,text), public.list_repairs(uuid) from public,anon,authenticated,service_role;
grant execute on function public.system_health(uuid), public.system_repair(uuid,text), public.list_repairs(uuid) to authenticated;

do $$ begin
 create extension if not exists pg_cron;
 perform cron.schedule('seer-self-heal', '*/15 * * * *', 'select private.self_heal()');
exception when others then null;
end $$;
commit;
