-- Support badge clears when the reply is read.
-- 1) support_threads gets user_read_at and admin_read_at: when each side last opened the thread.
-- 2) mark_support_read(thread) sets the caller's side: the thread's owner sets user_read_at, the
--    platform admin sets admin_read_at; anyone else is refused.
-- 3) support_unread() returns the threads to show in the badge, in one call:
--    mine: the caller's threads whose last message is from the team and newer than their reading;
--    team (platform admins only): open threads whose last message is from the user and newer than
--    the team's reading.
-- Existing threads start unread on both sides only if their last message is from the other side.
-- Forward-only.
begin;

alter table public.support_threads add column user_read_at timestamptz, add column admin_read_at timestamptz;
-- Existing threads: count as read up to now, so the new badge does not light up for old replies.
update public.support_threads set user_read_at = now(), admin_read_at = now();

create function private.mark_support_read(thread uuid) returns void language plpgsql security definer set search_path = '' as $$
declare t public.support_threads%rowtype;
begin
 select * into t from public.support_threads x where x.id = thread;
 if not found then raise exception 'Not allowed' using errcode = '42501'; end if;
 if t.user_id = auth.uid() then
  update public.support_threads set user_read_at = now() where id = thread;
 elsif private.is_platform_admin() then
  update public.support_threads set admin_read_at = now() where id = thread;
 else
  raise exception 'Not allowed' using errcode = '42501';
 end if;
end $$;

create function private.support_unread() returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
  'mine', coalesce((select jsonb_agg(t.id order by t.last_message_at desc) from public.support_threads t
     where t.user_id = auth.uid() and t.last_sender = 'admin' and (t.user_read_at is null or t.user_read_at < t.last_message_at)), '[]'::jsonb),
  'team', case when private.is_platform_admin() then coalesce((select jsonb_agg(t.id order by t.last_message_at desc) from public.support_threads t
     where t.status = 'open' and t.last_sender = 'user' and t.user_id <> auth.uid() and (t.admin_read_at is null or t.admin_read_at < t.last_message_at)), '[]'::jsonb) end)
$$;

revoke all on function private.mark_support_read(uuid), private.support_unread() from public,anon,authenticated;
grant execute on function private.mark_support_read(uuid), private.support_unread() to authenticated;
create function public.mark_support_read(thread uuid) returns void language sql set search_path = '' as $$ select private.mark_support_read(thread) $$;
create function public.support_unread() returns jsonb language sql stable set search_path = '' as $$ select private.support_unread() $$;
revoke all on function public.mark_support_read(uuid), public.support_unread() from public,anon,authenticated,service_role;
grant execute on function public.mark_support_read(uuid), public.support_unread() to authenticated;
commit;
