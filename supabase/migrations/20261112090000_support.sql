-- In-app support instead of a WhatsApp number.
-- 1) support_threads / support_messages: a conversation between one user and the platform team,
--    tied to the user's organization, with the page they were on and their last questions to the
--    assistant (only what the user typed; no records are attached).
-- 2) RLS: a user reads only their own threads and messages; the platform admin reads all. Nobody
--    writes directly: open, reply and close go through functions that check who is calling.
-- 3) A user may have at most 3 open threads, and send at most 20 messages in 10 minutes.
-- 4) Every new thread or user reply notifies the platform admins (bell + device push); every admin
--    reply notifies the user. Messages are in the realtime publication for live replies.
-- Forward-only.
begin;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('task','inquiry','inquiry_reply','leave','leave_decision','application','payment','absence_notice','announcement','member','subscription','signup','support'));

create table public.support_threads (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 subject text not null check (length(btrim(subject)) between 2 and 120),
 status text not null default 'open' check (status in ('open','closed')),
 page text check (page is null or page ~ '^/[A-Za-z0-9/_-]{0,199}$'),
 assistant_questions text[] not null default '{}' check (cardinality(assistant_questions) <= 5 and array_position(assistant_questions, null) is null),
 last_sender text not null default 'user' check (last_sender in ('user','admin')),
 created_at timestamptz not null default now(),
 last_message_at timestamptz not null default now(),
 closed_at timestamptz
);
create index support_threads_user_idx on public.support_threads(user_id, last_message_at desc);
create index support_threads_open_idx on public.support_threads(status, last_message_at desc);

create table public.support_messages (
 id uuid primary key default gen_random_uuid(),
 thread_id uuid not null references public.support_threads(id) on delete cascade,
 sender_id uuid references auth.users(id) on delete set null,
 from_admin boolean not null default false,
 body text not null check (length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index support_messages_thread_idx on public.support_messages(thread_id, created_at);
create index support_messages_sender_idx on public.support_messages(sender_id, created_at desc);

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_threads, public.support_messages from public,anon,authenticated;
grant select on public.support_threads, public.support_messages to authenticated;
create policy support_threads_read on public.support_threads for select to authenticated
 using (user_id = (select auth.uid()) or private.is_platform_admin());
create policy support_messages_read on public.support_messages for select to authenticated
 using (exists (select 1 from public.support_threads t where t.id = thread_id and t.user_id = (select auth.uid())) or private.is_platform_admin());

do $$ begin
 if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
  alter publication supabase_realtime add table public.support_messages, public.support_threads;
 end if;
end $$;

-- Too many messages in a short time from one person.
create function private.support_rate_check() returns void language plpgsql stable security definer set search_path = '' as $$
begin
 if (select count(*) from public.support_messages m where m.sender_id = auth.uid() and m.created_at > now() - interval '10 minutes') >= 20 then
  raise exception 'Too many messages' using errcode = '54000';
 end if;
end $$;
revoke all on function private.support_rate_check() from public,anon,authenticated;

-- A new thread from a member of the organization (works while the organization is locked).
create function private.open_support_thread(org uuid, subject text, body text, page text, questions text[]) returns uuid language plpgsql security definer set search_path = '' as $$
declare thread uuid; clean_page text; asked text[]; org_name text;
begin
 if auth.uid() is null or not private.is_org_member_raw(org) then raise exception 'Not a member' using errcode = '42501'; end if;
 if length(btrim(coalesce(subject,''))) < 2 or length(btrim(coalesce(body,''))) < 1 then raise exception 'Write the problem' using errcode = '22023'; end if;
 if (select count(*) from public.support_threads t where t.user_id = auth.uid() and t.status = 'open') >= 3 then
  raise exception 'Too many open threads' using errcode = '54000';
 end if;
 perform private.support_rate_check();
 -- Only the path of the page (no query string, so no ids or names from the address).
 clean_page := nullif(split_part(split_part(coalesce(page,''), '?', 1), '#', 1), '');
 if clean_page is not null and clean_page !~ '^/[A-Za-z0-9/_-]{0,199}$' then clean_page := null; end if;
 -- The last five questions to the assistant, oldest first, each cut to 300 characters.
 select coalesce(array_agg(left(btrim(recent.q), 300) order by recent.n), '{}') into asked
 from (select x.q, x.n from unnest(coalesce(questions, '{}')) with ordinality as x(q, n) where btrim(coalesce(x.q,'')) <> '' order by x.n desc limit 5) recent;
 insert into public.support_threads(organization_id, user_id, subject, page, assistant_questions)
 values (org, auth.uid(), left(btrim(subject), 120), clean_page, asked) returning id into thread;
 insert into public.support_messages(thread_id, sender_id, from_admin, body) values (thread, auth.uid(), false, left(btrim(body), 2000));
 select o.name into org_name from public.organizations o where o.id = org;
 perform private.notify_platform_admins(org, 'support', 'تذكرة دعم جديدة: ' || coalesce(org_name, 'منشأة'), left(btrim(subject), 120), '/admin/support/' || thread);
 return thread;
end $$;

-- A reply: the thread's owner (open threads only) or the platform admin.
create function private.reply_support(thread uuid, body text) returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.support_threads%rowtype; message uuid; org_name text;
begin
 select * into t from public.support_threads x where x.id = thread for update;
 if not found or (t.user_id <> auth.uid() and not private.is_platform_admin()) then raise exception 'Not allowed' using errcode = '42501'; end if;
 if t.status <> 'open' then raise exception 'Thread is closed' using errcode = '22023'; end if;
 if length(btrim(coalesce(body,''))) < 1 then raise exception 'Write a message' using errcode = '22023'; end if;
 perform private.support_rate_check();
 -- The owner replying is the user even if they are also a platform admin.
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

-- Closing: the owner or the platform admin. The user is told when the team closes it.
create function private.close_support_thread(thread uuid) returns void language plpgsql security definer set search_path = '' as $$
declare t public.support_threads%rowtype;
begin
 select * into t from public.support_threads x where x.id = thread for update;
 if not found or (t.user_id <> auth.uid() and not private.is_platform_admin()) then raise exception 'Not allowed' using errcode = '42501'; end if;
 if t.status = 'closed' then return; end if;
 update public.support_threads set status = 'closed', closed_at = now() where id = thread;
 if t.user_id <> auth.uid() then
  perform private.notify(t.organization_id, t.user_id, 'support', 'أُغلقت تذكرتك', left(t.subject, 120), '/dashboard/support/' || thread);
 end if;
end $$;

-- The platform console: every thread (or one) with who opened it, open ones first.
create function private.admin_support_threads(one_thread uuid) returns table(id uuid, subject text, status text, organization text, organization_id uuid, user_name text, user_email text, page text, last_sender text, last_message_at timestamptz, created_at timestamptz, messages bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 return query
 select t.id, t.subject, t.status, o.name, t.organization_id,
  (select m.display_name from public.memberships m where m.organization_id = t.organization_id and m.user_id = t.user_id),
  (select u.email::text from auth.users u where u.id = t.user_id),
  t.page, t.last_sender, t.last_message_at, t.created_at,
  (select count(*) from public.support_messages m where m.thread_id = t.id)
 from public.support_threads t join public.organizations o on o.id = t.organization_id
 where one_thread is null or t.id = one_thread
 order by (t.status = 'open') desc, (t.status = 'open' and t.last_sender = 'user') desc, t.last_message_at desc
 limit 300;
end $$;

revoke all on function private.open_support_thread(uuid,text,text,text,text[]), private.reply_support(uuid,text), private.close_support_thread(uuid), private.admin_support_threads(uuid) from public,anon,authenticated;
grant execute on function private.open_support_thread(uuid,text,text,text,text[]), private.reply_support(uuid,text), private.close_support_thread(uuid), private.admin_support_threads(uuid) to authenticated;
create function public.open_support_thread(org uuid, subject text, body text, page text default null, questions text[] default '{}') returns uuid language sql set search_path = '' as $$ select private.open_support_thread(org, subject, body, page, questions) $$;
create function public.reply_support(thread uuid, body text) returns uuid language sql set search_path = '' as $$ select private.reply_support(thread, body) $$;
create function public.close_support_thread(thread uuid) returns void language sql set search_path = '' as $$ select private.close_support_thread(thread) $$;
create function public.admin_support_threads(one_thread uuid default null) returns table(id uuid, subject text, status text, organization text, organization_id uuid, user_name text, user_email text, page text, last_sender text, last_message_at timestamptz, created_at timestamptz, messages bigint)
 language sql stable set search_path = '' as $$ select * from private.admin_support_threads(one_thread) $$;
revoke all on function public.open_support_thread(uuid,text,text,text,text[]), public.reply_support(uuid,text), public.close_support_thread(uuid), public.admin_support_threads(uuid) from public,anon,authenticated,service_role;
grant execute on function public.open_support_thread(uuid,text,text,text,text[]), public.reply_support(uuid,text), public.close_support_thread(uuid), public.admin_support_threads(uuid) to authenticated;
commit;
