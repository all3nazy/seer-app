-- «صندوق الوارد» in «سِير أدمن»: a copy of the emails that reach the Seer Gmail inbox.
-- A small Apps Script inside that Gmail account (scripts/gmail-inbox-bridge.gs) posts new messages to
-- /api/inbox/ingest with a shared secret; the route stores them with the service role. Only the
-- plain text and the attachment names are kept (no files, no HTML). Platform owners and the support
-- role read them here; everyone else, including organizations, has no access.

create table private.inbox_messages (
 id uuid primary key default gen_random_uuid(),
 gmail_id text not null unique check (length(gmail_id) between 1 and 64),
 thread_id text not null check (length(thread_id) between 1 and 64),
 from_name text check (from_name is null or length(from_name) <= 200),
 from_email text not null check (length(from_email) between 3 and 320),
 to_text text check (to_text is null or length(to_text) <= 1000),
 subject text check (subject is null or length(subject) <= 500),
 body text not null default '' check (length(body) <= 50000),
 attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array'),
 received_at timestamptz not null,
 created_at timestamptz not null default now(),
 read_at timestamptz,
 archived_at timestamptz
);
create index inbox_messages_received on private.inbox_messages (received_at desc);
alter table private.inbox_messages enable row level security;
revoke all on private.inbox_messages from public, anon, authenticated;

-- Stores a batch from the bridge (max 50). Messages already stored (same Gmail id) are skipped.
-- Returns how many were new.
create function private.inbox_ingest(messages jsonb) returns integer language plpgsql security definer set search_path = '' as $$
declare m jsonb; added integer := 0; n integer; files jsonb;
begin
 if jsonb_typeof(messages) <> 'array' or jsonb_array_length(messages) > 50 then raise exception 'Bad batch' using errcode = '22023'; end if;
 for m in select * from jsonb_array_elements(messages) loop
  if jsonb_typeof(m) <> 'object' or coalesce(m->>'gmail_id', '') !~ '^[A-Za-z0-9_-]{1,64}$' or coalesce(m->>'thread_id', '') !~ '^[A-Za-z0-9_-]{1,64}$'
     or coalesce(m->>'from_email', '') !~ '^[^@\s]{1,200}@[^@\s]{1,118}$' then continue; end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', left(coalesce(a->>'name', 'ملف'), 200), 'size', greatest(0, least(coalesce((a->>'size')::bigint, 0), 1000000000)))), '[]')
   into files from (select a from jsonb_array_elements(case when jsonb_typeof(m->'attachments') = 'array' then m->'attachments' else '[]' end) a limit 20) x;
  insert into private.inbox_messages(gmail_id, thread_id, from_name, from_email, to_text, subject, body, attachments, received_at)
  values (m->>'gmail_id', m->>'thread_id', nullif(left(btrim(coalesce(m->>'from_name', '')), 200), ''), lower(m->>'from_email'),
   nullif(left(coalesce(m->>'to', ''), 1000), ''), nullif(left(coalesce(m->>'subject', ''), 500), ''), left(coalesce(m->>'body', ''), 50000), files,
   coalesce(case when coalesce(m->>'received_at', '') ~ '^\d{4}-\d{2}-\d{2}T' then (m->>'received_at')::timestamptz end, now()))
  on conflict (gmail_id) do nothing;
  get diagnostics n = row_count;
  added := added + n;
 end loop;
 return added;
end $$;

-- The list: «الوارد» (not archived) or «المؤرشف», newest first, without the body.
create function private.admin_inbox(box text default 'inbox') returns table(id uuid, thread_id text, from_name text, from_email text, subject text, preview text, attachments integer, received_at timestamptz, read_at timestamptz, archived_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin(array['support']);
 return query select m.id, m.thread_id, m.from_name, m.from_email, m.subject, left(regexp_replace(m.body, '\s+', ' ', 'g'), 160), jsonb_array_length(m.attachments), m.received_at, m.read_at, m.archived_at
 from private.inbox_messages m where (box = 'archived') = (m.archived_at is not null) order by m.received_at desc limit 300;
end $$;

-- One message in full; opening it marks it read.
create function private.admin_inbox_message(message uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m private.inbox_messages%rowtype;
begin
 perform private.require_platform_admin(array['support']);
 update private.inbox_messages x set read_at = coalesce(x.read_at, now()) where x.id = message returning * into m;
 if not found then return null; end if;
 return jsonb_build_object('id', m.id, 'thread_id', m.thread_id, 'from_name', m.from_name, 'from_email', m.from_email, 'to', m.to_text, 'subject', m.subject,
  'body', m.body, 'attachments', m.attachments, 'received_at', m.received_at, 'read_at', m.read_at, 'archived_at', m.archived_at);
end $$;

-- «غير مقروء» / «أرشفة» / «إرجاع للوارد».
create function private.admin_inbox_mark(message uuid, action text) returns void language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_platform_admin(array['support']);
 if action not in ('unread', 'archive', 'unarchive') then raise exception 'Bad action' using errcode = '22023'; end if;
 update private.inbox_messages x set
  read_at = case when action = 'unread' then null else x.read_at end,
  archived_at = case when action = 'archive' then now() when action = 'unarchive' then null else x.archived_at end
 where x.id = message;
 if not found then raise exception 'Unknown message' using errcode = 'P0002'; end if;
end $$;

-- The sidebar count: unread messages in «الوارد». Zero for anyone who may not open the inbox.
create function private.admin_inbox_unread() returns integer language plpgsql stable security definer set search_path = '' as $$
begin
 begin perform private.require_platform_admin(array['support']); exception when others then return 0; end;
 return (select count(*) from private.inbox_messages m where m.read_at is null and m.archived_at is null);
end $$;

create function public.inbox_ingest(messages jsonb) returns integer language sql set search_path = '' as $$ select private.inbox_ingest(messages) $$;
create function public.admin_inbox(box text default 'inbox') returns table(id uuid, thread_id text, from_name text, from_email text, subject text, preview text, attachments integer, received_at timestamptz, read_at timestamptz, archived_at timestamptz)
 language sql stable set search_path = '' as $$ select * from private.admin_inbox(box) $$;
create function public.admin_inbox_message(message uuid) returns jsonb language sql set search_path = '' as $$ select private.admin_inbox_message(message) $$;
create function public.admin_inbox_mark(message uuid, action text) returns void language sql set search_path = '' as $$ select private.admin_inbox_mark(message, action) $$;
create function public.admin_inbox_unread() returns integer language sql stable set search_path = '' as $$ select private.admin_inbox_unread() $$;

revoke all on function private.inbox_ingest(jsonb), private.admin_inbox(text), private.admin_inbox_message(uuid), private.admin_inbox_mark(uuid,text), private.admin_inbox_unread(),
 public.inbox_ingest(jsonb), public.admin_inbox(text), public.admin_inbox_message(uuid), public.admin_inbox_mark(uuid,text), public.admin_inbox_unread() from public, anon, authenticated, service_role;
grant execute on function private.inbox_ingest(jsonb), public.inbox_ingest(jsonb) to service_role;
grant execute on function private.admin_inbox(text), private.admin_inbox_message(uuid), private.admin_inbox_mark(uuid,text), private.admin_inbox_unread(),
 public.admin_inbox(text), public.admin_inbox_message(uuid), public.admin_inbox_mark(uuid,text), public.admin_inbox_unread() to authenticated;
