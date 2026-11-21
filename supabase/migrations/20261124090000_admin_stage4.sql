-- «سِير أدمن», stage 4: backups, system health, and a read-only view of an organization.
-- 1) Backups (Supabase Free has no daily backups or PITR yet):
--    - storage bucket «platform-backups»: private, and this migration adds no storage policy for it,
--      so anon and authenticated cannot list, read or write it; only the service role (the server).
--    - private.backup_runs: one row per run (daily/manual, running/ok/failed, size, rows, duration,
--      manifest with every file's row count and sha256).
--    - For the server (service role only): backup_tables(), backup_table_page() (one page of one
--      table, ordered by primary key), backup_db_version(), backup_begin(), backup_finish(),
--      backup_mark_purged(), backup_org_tables(), backup_org_page().
--    - private.backup_watch() (pg_cron, hourly): a Telegram alert when the last good backup is older
--      than 26 hours; a failed run alerts at once (backup_finish).
--    - For the owner (aal2, audited): admin_backups(), admin_backup_authorize() («نسخة الحين»,
--      rate limited), admin_backup_download(run, file) (checked and logged before the server signs a
--      short link), admin_org_export(org) (logged before the server exports one organization).
-- 2) System health (owner): admin_system_health() — database, every pg_cron job with its last run
--    (cron.job_run_details), queues with the oldest waiting item, the last backup, recent errors;
--    admin_error_handled(fingerprint, status).
-- 3) «مشاهدة المنصة كأنك هم» (owner + support): admin_org_view(org, section) returns what the
--    organization's owner sees on the main pages, read-only, and logs each view (org_viewed) in the
--    organization's log. No session is impersonated and nothing can be written.
-- Forward-only.
begin;

-- 1) Backups --------------------------------------------------------------------------------------------
do $$ begin
 insert into storage.buckets(id, name, public) values ('platform-backups', 'platform-backups', false) on conflict (id) do update set public = false;
exception when undefined_table then null;
end $$;

create table private.backup_runs (
 id bigint generated always as identity primary key,
 kind text not null check (kind in ('daily','manual')),
 status text not null default 'running' check (status in ('running','ok','failed')),
 folder text not null check (folder ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 duration_ms integer,
 bytes bigint,
 tables integer,
 rows bigint,
 manifest jsonb,
 error text check (error is null or length(error) <= 500),
 triggered_by uuid references auth.users(id) on delete set null,
 purged_at timestamptz
);
create index backup_runs_started_idx on private.backup_runs(started_at desc);
alter table private.backup_runs enable row level security;
revoke all on private.backup_runs from public, anon, authenticated;

-- Every table in public and private, with its row count and primary key (the order of the pages).
create function private.backup_tables() returns table(schema_name text, table_name text, row_count bigint, pk text[]) language plpgsql stable security definer set search_path = '' as $$
declare t record; n bigint;
begin
 for t in select n.nspname::text as s, c.relname::text as r, c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public','private') and c.relkind in ('r','p') order by 1, 2 loop
  execute format('select count(*) from %I.%I', t.s, t.r) into n;
  schema_name := t.s; table_name := t.r; row_count := n;
  pk := coalesce((select array_agg(a.attname::text order by array_position(i.indkey::int2[], a.attnum)) from pg_index i
   join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = t.oid and i.indisprimary), '{}');
  return next;
 end loop;
end $$;

-- One page of one table as a JSON array (rows in primary-key order, else physical order).
create function private.backup_table_page(p_schema text, p_table text, p_offset integer, p_limit integer) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare rel oid; keys text; result jsonb;
begin
 if p_schema not in ('public','private') then raise exception 'Schema' using errcode = '22023'; end if;
 select c.oid into rel from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = p_schema and c.relname = p_table and c.relkind in ('r','p');
 if rel is null then raise exception 'No such table' using errcode = 'P0002'; end if;
 select string_agg(format('%I', a.attname), ', ' order by array_position(i.indkey::int2[], a.attnum)) into keys
 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = rel and i.indisprimary;
 execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from %I.%I order by %s offset %s limit %s) t',
  p_schema, p_table, coalesce(keys, 'ctid'), greatest(coalesce(p_offset, 0), 0), least(greatest(coalesce(p_limit, 1000), 1), 5000)) into result;
 return result;
end $$;

-- The schema version the database knows (Supabase records migrations applied by the CLI there).
create function private.backup_db_version() returns text language plpgsql stable security definer set search_path = '' as $$
declare v text;
begin
 if to_regclass('supabase_migrations.schema_migrations') is null then return null; end if;
 execute 'select max(version)::text from supabase_migrations.schema_migrations' into v;
 return v;
end $$;

-- Start a run. Daily: once a day (a second call the same day returns null). Manual: not while one
-- is running, and at most one every 10 minutes.
create function private.backup_begin(p_kind text, p_actor uuid default null) returns bigint language plpgsql security definer set search_path = '' as $$
declare made bigint; today text := to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD');
begin
 if p_kind not in ('daily','manual') then raise exception 'Kind' using errcode = '22023'; end if;
 perform pg_advisory_xact_lock(hashtext('seer-backup'));
 -- A run that never finished is given up after 30 minutes.
 update private.backup_runs set status = 'failed', finished_at = now(), error = 'لم تكتمل (انتهت المهلة)' where status = 'running' and started_at < now() - interval '30 minutes';
 if exists (select 1 from private.backup_runs r where r.status = 'running') then raise exception 'A backup is running' using errcode = '54000'; end if;
 if p_kind = 'daily' and exists (select 1 from private.backup_runs r where r.kind = 'daily' and r.status = 'ok' and r.folder = today) then return null; end if;
 if p_kind = 'manual' and exists (select 1 from private.backup_runs r where r.kind = 'manual' and r.started_at > now() - interval '10 minutes') then raise exception 'Wait a few minutes' using errcode = '54000'; end if;
 insert into private.backup_runs(kind, folder, triggered_by) values (p_kind, today, p_actor) returning id into made;
 return made;
end $$;

create function private.backup_finish(p_run bigint, p_ok boolean, p_bytes bigint, p_tables integer, p_rows bigint, p_manifest jsonb, p_error text) returns void language plpgsql security definer set search_path = '' as $$
declare r private.backup_runs%rowtype;
begin
 update private.backup_runs set status = case when p_ok then 'ok' else 'failed' end, finished_at = now(),
  duration_ms = (extract(epoch from now() - started_at) * 1000)::integer, bytes = p_bytes, tables = p_tables, rows = p_rows, manifest = p_manifest, error = left(p_error, 500)
 where id = p_run and status = 'running' returning * into r;
 if r.id is null then raise exception 'No running backup' using errcode = 'P0002'; end if;
 if not p_ok then
  perform private.telegram_queue('🚨 فشل النسخ الاحتياطي (' || case when r.kind = 'daily' then 'اليومي' else 'اليدوي' end || ')' || chr(10) || coalesce(left(p_error, 300), 'خطأ غير معروف'),
   jsonb_build_array(jsonb_build_object('text', 'النسخ الاحتياطي', 'url', '/admin/backups')));
 end if;
end $$;

create function private.backup_mark_purged(p_folder text) returns void language sql security definer set search_path = '' as $$
 update private.backup_runs set purged_at = now() where folder = p_folder and purged_at is null
$$;

-- Hourly: alert when the last good backup is older than 26 hours (at most every 12 hours).
create function private.backup_watch() returns boolean language plpgsql security definer set search_path = '' as $$
declare last_ok timestamptz := (select max(r.finished_at) from private.backup_runs r where r.status = 'ok');
begin
 if last_ok is not null and last_ok > now() - interval '26 hours' then return false; end if;
 if exists (select 1 from private.telegram_alerts a where a.key = 'backup-missing' and a.sent_at > now() - interval '12 hours') then return false; end if;
 return private.telegram_alert_once('backup-missing', '⚠️ ما فيه نسخة احتياطية ناجحة ' || case when last_ok is null then 'أبدًا' else 'منذ ' || to_char(last_ok at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' بتوقيت الرياض' end,
  jsonb_build_array(jsonb_build_object('text', 'النسخ الاحتياطي', 'url', '/admin/backups')));
end $$;

-- One organization's data: every public table with an organization_id column.
create function private.backup_org_tables() returns table(table_name text) language sql stable security definer set search_path = '' as $$
 select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid
 where n.nspname = 'public' and c.relkind in ('r','p') and a.attname = 'organization_id' and not a.attisdropped order by 1
$$;
create function private.backup_org_page(p_table text, p_org uuid, p_offset integer, p_limit integer) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if not exists (select 1 from private.backup_org_tables() t where t.table_name = p_table) then raise exception 'No such table' using errcode = 'P0002'; end if;
 execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from public.%I where organization_id = $1 order by ctid offset %s limit %s) t',
  p_table, greatest(coalesce(p_offset, 0), 0), least(greatest(coalesce(p_limit, 1000), 1), 5000)) using p_org into result;
 return result;
end $$;

-- For the owner in «سِير أدمن».
create function private.admin_backups() returns table(id bigint, kind text, status text, folder text, started_at timestamptz, finished_at timestamptz, duration_ms integer, bytes bigint,
 tables integer, rows bigint, manifest jsonb, error text, triggered_by text, purged_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin(array[]::text[]);
 return query select r.id, r.kind, r.status, r.folder, r.started_at, r.finished_at, r.duration_ms, r.bytes, r.tables, r.rows, r.manifest, r.error,
  (select u.email::text from auth.users u where u.id = r.triggered_by), r.purged_at
 from private.backup_runs r order by r.started_at desc limit 60;
end $$;

-- «نسخة الحين»: checks the role and the limits, logs it, and starts the run for the server.
create function private.admin_backup_authorize() returns bigint language plpgsql security definer set search_path = '' as $$
declare run bigint;
begin
 perform private.require_platform_admin(array[]::text[]);
 run := private.backup_begin('manual', auth.uid());
 perform private.admin_log(null, 'backup_started', jsonb_build_object('run', run));
 return run;
end $$;

-- A download: the file must be in that run's manifest; returns the storage path to sign (short link).
create function private.admin_backup_download(p_run bigint, p_file text) returns text language plpgsql security definer set search_path = '' as $$
declare r private.backup_runs%rowtype;
begin
 perform private.require_platform_admin(array[]::text[]);
 select * into r from private.backup_runs x where x.id = p_run;
 if not found or r.status <> 'ok' or r.purged_at is not null then raise exception 'No such backup' using errcode = 'P0002'; end if;
 if p_file is null or p_file !~ '^[a-z_0-9.]+$' or not (p_file = 'manifest.json' or exists (select 1 from jsonb_array_elements(coalesce(r.manifest -> 'files', '[]'::jsonb)) f where f ->> 'name' = p_file)) then
  raise exception 'No such file' using errcode = 'P0002';
 end if;
 perform private.admin_log(null, 'backup_downloaded', jsonb_build_object('run', r.id, 'folder', r.folder, 'file', p_file));
 return r.folder || '/' || p_file;
end $$;

-- Export one organization (PDPL portability): logged in that organization's log.
create function private.admin_org_export(org uuid) returns text language plpgsql security definer set search_path = '' as $$
declare org_name text := (select o.name from public.organizations o where o.id = org);
begin
 perform private.require_platform_admin(array[]::text[]);
 if org_name is null then raise exception 'No such organization' using errcode = 'P0002'; end if;
 perform private.admin_log(org, 'org_exported', '{}'::jsonb);
 return org_name;
end $$;

-- 2) System health -------------------------------------------------------------------------------------
create function private.admin_system_health() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare jobs jsonb := '[]'::jsonb;
begin
 perform private.require_platform_admin(array[]::text[]);
 if to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null then
  execute $q$
   select coalesce(jsonb_agg(jsonb_build_object('name', j.jobname, 'schedule', j.schedule, 'active', j.active, 'status', d.status, 'message', left(d.return_message, 200),
     'started_at', d.start_time, 'duration_ms', (extract(epoch from d.end_time - d.start_time) * 1000)::integer,
     'failed_24h', (select count(*) from cron.job_run_details f where f.jobid = j.jobid and f.status = 'failed' and f.start_time > now() - interval '24 hours')) order by j.jobname), '[]'::jsonb)
   from cron.job j left join lateral (select * from cron.job_run_details x where x.jobid = j.jobid order by x.start_time desc limit 1) d on true
  $q$ into jobs;
 end if;
 return jsonb_build_object(
  'database', true,
  'checked_at', now(),
  'cron', jobs,
  'queues', jsonb_build_array(
   (select jsonb_build_object('key', 'email', 'waiting', count(*), 'failed', (select count(*) from private.email_outbox f where f.status = 'failed'), 'oldest', min(e.created_at)) from private.email_outbox e where e.status = 'queued'),
   (select jsonb_build_object('key', 'messages', 'waiting', count(*), 'failed', (select count(*) from public.message_outbox f where f.status = 'failed'), 'oldest', min(m.created_at)) from public.message_outbox m where m.status in ('queued','sending')),
   (select jsonb_build_object('key', 'telegram', 'waiting', count(*), 'failed', (select count(*) from private.telegram_outbox f where f.status = 'failed'), 'oldest', min(t.created_at)) from private.telegram_outbox t where t.status in ('queued','sending')),
   (select jsonb_build_object('key', 'push', 'waiting', count(*), 'failed', 0, 'oldest', min(p.created_at)) from private.push_jobs p)),
  'backup', (select jsonb_build_object('status', r.status, 'kind', r.kind, 'started_at', r.started_at, 'finished_at', r.finished_at, 'bytes', r.bytes, 'error', r.error)
   from private.backup_runs r order by r.started_at desc limit 1),
  'last_ok_backup', (select max(r.finished_at) from private.backup_runs r where r.status = 'ok'),
  'errors', coalesce((select jsonb_agg(jsonb_build_object('fingerprint', e.fingerprint, 'kind', e.kind, 'message', e.message, 'route', e.route, 'count', e.count, 'last_seen', e.last_seen,
    'status', e.status, 'organization', (select o.name from public.organizations o where o.id = e.organization_id)) order by e.last_seen desc)
   from (select * from public.system_errors x where x.status in ('new','known') order by x.last_seen desc limit 30) e), '[]'::jsonb));
end $$;

create function private.admin_error_handled(p_fingerprint text, p_status text) returns void language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_platform_admin(array[]::text[]);
 if p_status not in ('resolved','ignored','known') then raise exception 'Status' using errcode = '22023'; end if;
 update public.system_errors set status = p_status where fingerprint = p_fingerprint;
 if not found then raise exception 'No such error' using errcode = 'P0002'; end if;
 perform private.admin_log(null, 'error_handled', jsonb_build_object('fingerprint', p_fingerprint, 'status', p_status));
end $$;

-- 3) Read-only view of an organization -------------------------------------------------------------------
-- section: dashboard | students | attendance | finance | staff | settings. Logged every time.
create function private.admin_org_view(org uuid, p_section text default 'dashboard') returns jsonb language plpgsql security definer set search_path = '' as $$
declare today date := private.riyadh_today(); o public.organizations%rowtype; result jsonb;
begin
 perform private.require_platform_admin(array['support']);
 if coalesce(p_section, 'dashboard') not in ('dashboard','students','attendance','finance','staff','settings') then raise exception 'Section' using errcode = '22023'; end if;
 select * into o from public.organizations x where x.id = org;
 if not found then return null; end if;
 perform private.admin_log(org, 'org_viewed', jsonb_build_object('section', coalesce(p_section, 'dashboard')));
 result := jsonb_build_object('organization_id', o.id, 'name', o.name, 'type', o.type, 'section', coalesce(p_section, 'dashboard'), 'today', today,
  'access', private.org_access(org),
  'plan', (select p.name from public.subscriptions s join public.plans p on p.id = s.plan_id where s.organization_id = org),
  'counts', jsonb_build_object(
   'children', (select count(*) from public.children c where c.organization_id = org),
   'staff', (select count(*) from public.memberships m where m.organization_id = org),
   'guardians', (select count(*) from public.guardians g where g.organization_id = org),
   'sections', (select count(*) from public.sections s where s.organization_id = org)),
  'attendance_today', (select jsonb_build_object('present', count(*) filter (where a.status = 'present'), 'absent', count(*) filter (where a.status = 'absent'),
    'late', count(*) filter (where a.status = 'late'), 'excused', count(*) filter (where a.status = 'excused')) from public.attendance a where a.organization_id = org and a.attendance_date = today));
 if p_section = 'students' then
  result := result || jsonb_build_object('students', coalesce((select jsonb_agg(jsonb_build_object('name', c.full_name, 'gender', c.gender, 'section', s.name, 'created_at', c.created_at) order by c.full_name)
   from (select * from public.children x where x.organization_id = org order by x.full_name limit 300) c left join public.sections s on s.id = c.section_id), '[]'::jsonb));
 elsif p_section = 'attendance' then
  result := result || jsonb_build_object('days', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'present', d.present, 'absent', d.absent, 'late', d.late, 'excused', d.excused) order by d.day desc)
   from (select a.attendance_date as day, count(*) filter (where a.status = 'present') as present, count(*) filter (where a.status = 'absent') as absent,
     count(*) filter (where a.status = 'late') as late, count(*) filter (where a.status = 'excused') as excused
    from public.attendance a where a.organization_id = org and a.attendance_date > today - 14 group by a.attendance_date) d), '[]'::jsonb));
 elsif p_section = 'finance' then
  result := result || jsonb_build_object('finance', jsonb_build_object(
   'invoiced', coalesce((select sum(i.amount_sar) from public.invoices i where i.organization_id = org and i.status in ('issued','paid')), 0),
   'invoices', (select count(*) from public.invoices i where i.organization_id = org and i.status in ('issued','paid')),
   'collected', coalesce((select sum(p.amount) from public.payments p where p.organization_id = org), 0),
   'collected_month', coalesce((select sum(p.amount) from public.payments p where p.organization_id = org and p.paid_on >= date_trunc('month', today)::date), 0),
   'drafts', (select count(*) from public.invoices i where i.organization_id = org and i.status = 'draft'),
   'recent', coalesce((select jsonb_agg(jsonb_build_object('paid_on', p.paid_on, 'amount', p.amount, 'method', p.method) order by p.paid_on desc)
    from (select * from public.payments x where x.organization_id = org order by x.paid_on desc limit 10) p), '[]'::jsonb)));
 elsif p_section = 'staff' then
  result := result || jsonb_build_object('staff', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(m.display_name, sp.full_name, '—'), 'role', m.role, 'job_title', sp.job_title) order by m.role, m.display_name)
   from public.memberships m left join public.staff_profiles sp on sp.organization_id = m.organization_id and sp.user_id = m.user_id where m.organization_id = org), '[]'::jsonb));
 elsif p_section = 'settings' then
  result := result || jsonb_build_object('settings', jsonb_build_object(
   'disabled', coalesce((select s.disabled_features from public.organization_settings s where s.organization_id = org), '{}'),
   'blocked', private.org_blocked_features(org),
   'colors', (select jsonb_build_object('primary', s.primary_color, 'accent', s.accent_color) from public.organization_settings s where s.organization_id = org),
   'message_channel', (select m.channel from public.message_settings m where m.organization_id = org),
   'message_provider', (select m.provider from public.message_settings m where m.organization_id = org),
   'city', (select p.city from public.organization_profiles p where p.organization_id = org)));
 end if;
 return result;
end $$;

-- Grants ---------------------------------------------------------------------------------------------
revoke all on function private.backup_tables(), private.backup_table_page(text,text,integer,integer), private.backup_db_version(), private.backup_begin(text,uuid),
 private.backup_finish(bigint,boolean,bigint,integer,bigint,jsonb,text), private.backup_mark_purged(text), private.backup_watch(), private.backup_org_tables(),
 private.backup_org_page(text,uuid,integer,integer), private.admin_backups(), private.admin_backup_authorize(), private.admin_backup_download(bigint,text), private.admin_org_export(uuid),
 private.admin_system_health(), private.admin_error_handled(text,text), private.admin_org_view(uuid,text) from public, anon, authenticated;
grant execute on function private.admin_backups(), private.admin_backup_authorize(), private.admin_backup_download(bigint,text), private.admin_org_export(uuid),
 private.admin_system_health(), private.admin_error_handled(text,text), private.admin_org_view(uuid,text) to authenticated;
grant execute on function private.backup_tables(), private.backup_table_page(text,text,integer,integer), private.backup_db_version(), private.backup_begin(text,uuid),
 private.backup_finish(bigint,boolean,bigint,integer,bigint,jsonb,text), private.backup_mark_purged(text), private.backup_org_tables(), private.backup_org_page(text,uuid,integer,integer) to service_role;

-- Server wrappers (service role only).
create function public.backup_tables() returns table(schema_name text, table_name text, row_count bigint, pk text[]) language sql stable set search_path = '' as $$ select * from private.backup_tables() $$;
create function public.backup_table_page(p_schema text, p_table text, p_offset integer, p_limit integer) returns jsonb language sql stable set search_path = '' as $$ select private.backup_table_page(p_schema, p_table, p_offset, p_limit) $$;
create function public.backup_db_version() returns text language sql stable set search_path = '' as $$ select private.backup_db_version() $$;
create function public.backup_begin(p_kind text) returns bigint language sql set search_path = '' as $$ select private.backup_begin(p_kind, null) $$;
create function public.backup_finish(p_run bigint, p_ok boolean, p_bytes bigint, p_tables integer, p_rows bigint, p_manifest jsonb, p_error text) returns void language sql set search_path = '' as $$
 select private.backup_finish(p_run, p_ok, p_bytes, p_tables, p_rows, p_manifest, p_error) $$;
create function public.backup_mark_purged(p_folder text) returns void language sql set search_path = '' as $$ select private.backup_mark_purged(p_folder) $$;
create function public.backup_org_tables() returns table(table_name text) language sql stable set search_path = '' as $$ select * from private.backup_org_tables() $$;
create function public.backup_org_page(p_table text, p_org uuid, p_offset integer, p_limit integer) returns jsonb language sql stable set search_path = '' as $$ select private.backup_org_page(p_table, p_org, p_offset, p_limit) $$;
revoke all on function public.backup_tables(), public.backup_table_page(text,text,integer,integer), public.backup_db_version(), public.backup_begin(text),
 public.backup_finish(bigint,boolean,bigint,integer,bigint,jsonb,text), public.backup_mark_purged(text), public.backup_org_tables(), public.backup_org_page(text,uuid,integer,integer)
 from public, anon, authenticated, service_role;
grant execute on function public.backup_tables(), public.backup_table_page(text,text,integer,integer), public.backup_db_version(), public.backup_begin(text),
 public.backup_finish(bigint,boolean,bigint,integer,bigint,jsonb,text), public.backup_mark_purged(text), public.backup_org_tables(), public.backup_org_page(text,uuid,integer,integer) to service_role;

-- Admin wrappers (authenticated; each checks the role and aal2 inside).
create function public.admin_backups() returns table(id bigint, kind text, status text, folder text, started_at timestamptz, finished_at timestamptz, duration_ms integer, bytes bigint,
 tables integer, rows bigint, manifest jsonb, error text, triggered_by text, purged_at timestamptz) language sql stable set search_path = '' as $$ select * from private.admin_backups() $$;
create function public.admin_backup_authorize() returns bigint language sql set search_path = '' as $$ select private.admin_backup_authorize() $$;
create function public.admin_backup_download(p_run bigint, p_file text) returns text language sql set search_path = '' as $$ select private.admin_backup_download(p_run, p_file) $$;
create function public.admin_org_export(org uuid) returns text language sql set search_path = '' as $$ select private.admin_org_export(org) $$;
create function public.admin_system_health() returns jsonb language sql stable set search_path = '' as $$ select private.admin_system_health() $$;
create function public.admin_error_handled(p_fingerprint text, p_status text) returns void language sql set search_path = '' as $$ select private.admin_error_handled(p_fingerprint, p_status) $$;
create function public.admin_org_view(org uuid, p_section text default 'dashboard') returns jsonb language sql set search_path = '' as $$ select private.admin_org_view(org, p_section) $$;
revoke all on function public.admin_backups(), public.admin_backup_authorize(), public.admin_backup_download(bigint,text), public.admin_org_export(uuid), public.admin_system_health(),
 public.admin_error_handled(text,text), public.admin_org_view(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.admin_backups(), public.admin_backup_authorize(), public.admin_backup_download(bigint,text), public.admin_org_export(uuid), public.admin_system_health(),
 public.admin_error_handled(text,text), public.admin_org_view(uuid,text) to authenticated;

-- Hourly check for a missing backup.
do $$ begin
 perform cron.schedule('seer-backup-watch', '17 * * * *', 'select private.backup_watch()');
exception when others then null;
end $$;
commit;
