-- «سِير أدمن», stage 1: platform-admin powers need two-step verification.
-- 1) private.is_platform_admin() is true only for a platform admin whose session passed two-step
--    verification (Supabase MFA: auth.jwt() ->> 'aal' = 'aal2'). Every admin function goes through
--    private.require_platform_admin() → is_platform_admin(), and so do the RLS policies that let the
--    platform team read across organizations, so a stolen password alone (aal1) can do nothing as an
--    admin, from the admin app, the subscriber app or a direct API call.
-- 2) private.telegram_handle: the Telegram bot acts as the linked admin with aal2 claims (the chat is
--    linked only from an aal2 session and is itself a second factor). Body unchanged otherwise.
-- 3) public.am_platform_admin_account(): whether the signed-in account is a platform admin at all,
--    before two-step verification. «سِير أدمن» uses it only to decide whether to show the
--    verification step or refuse the account; it grants nothing.
-- Not affected: cron jobs and service-role routes (they never call the admin check), notifications
-- to the platform admins (they read private.platform_admins directly), and every subscriber function.
-- Forward-only.
begin;

create or replace function private.is_platform_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
   and exists (select 1 from private.platform_admins a where a.user_id = auth.uid())
$$;

create or replace function private.telegram_handle(update jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 msg jsonb := update -> 'message'; cb jsonb := update -> 'callback_query';
 chat bigint; text_in text; admin uuid; code text; c private.telegram_link_codes%rowtype;
 replies jsonb := '[]'::jsonb; answer jsonb; clear jsonb; result jsonb;
begin
 chat := coalesce((msg -> 'chat' ->> 'id')::bigint, (cb -> 'message' -> 'chat' ->> 'id')::bigint);
 if chat is null then return '{}'::jsonb; end if;
 -- Private chats only.
 if coalesce(msg -> 'chat' ->> 'type', cb -> 'message' -> 'chat' ->> 'type', 'private') <> 'private' then return '{}'::jsonb; end if;
 text_in := btrim(coalesce(msg ->> 'text', ''));

 -- Linking: "/link CODE" or the start link "/start CODE".
 if msg is not null and text_in ~* '^/(link|start)(@\w+)?(\s|$)' then
  code := upper(btrim(regexp_replace(text_in, '^/\w+(@\w+)?\s*', '')));
  if code ~ '^[A-HJ-NP-Z2-9]{8}$' then
   select * into c from private.telegram_link_codes k where k.code_hash = private.invite_hash(code) for update;
   if not found or c.used_at is not null or c.expires_at <= now() or not exists (select 1 from private.platform_admins a where a.user_id = c.user_id) then
    return jsonb_build_object('replies', jsonb_build_array(private.telegram_reply(chat, 'الرمز غير صحيح أو انتهت صلاحيته. أنشئ رمزًا جديدًا من لوحة المسؤول ← إعدادات الدفع ← تيليقرام.')));
   end if;
   update private.telegram_link_codes set used_at = now() where code_hash = c.code_hash;
   delete from private.telegram_links where chat_id = chat or user_id = c.user_id;
   insert into private.telegram_links(user_id, chat_id, username) values (c.user_id, chat, left(msg -> 'from' ->> 'username', 64));
   insert into private.platform_audit(actor_id, action, detail) values (c.user_id, 'telegram_linked', '{}'::jsonb);
   return jsonb_build_object('replies', jsonb_build_array(private.telegram_reply(chat, 'تم ربط تيليقرام بحسابك في سِير ✓' || chr(10) || chr(10) || private.telegram_help())));
  end if;
  if not exists (select 1 from private.telegram_links l join private.platform_admins a on a.user_id = l.user_id where l.chat_id = chat) then
   return jsonb_build_object('replies', jsonb_build_array(private.telegram_reply(chat, 'أهلًا 👋 هذا بوت سِير لمسؤولي المنصة. للربط: من لوحة المسؤول ← إعدادات الدفع ← «اربط تيليقرام»، ثم أرسل هنا /link والرمز.')));
  end if;
 end if;

 -- Everything else: linked platform admins only. Unlinked chats are ignored.
 select l.user_id into admin from private.telegram_links l join private.platform_admins a on a.user_id = l.user_id where l.chat_id = chat;
 if admin is null then return '{}'::jsonb; end if;
 -- Act as the linked admin: the same permission checks and audit as in the console.
 perform set_config('request.jwt.claim.sub', admin::text, true);
 -- The linked Telegram chat is the admin's second factor (only an admin signed in with two-step
 -- verification can link it), so the claims carry aal2 like a console session.
 perform set_config('request.jwt.claims', jsonb_build_object('sub', admin::text, 'role', 'authenticated', 'aal', 'aal2')::text, true);

 if cb is not null then
  result := private.telegram_on_button(chat, cb);
  answer := jsonb_build_object('id', cb ->> 'id', 'text', coalesce(result ->> 'toast', 'تم'));
  if (result ->> 'clear')::boolean then clear := jsonb_build_object('chat_id', chat, 'message_id', (cb -> 'message' ->> 'message_id')::bigint); end if;
  return jsonb_strip_nulls(jsonb_build_object('replies', coalesce(result -> 'replies', '[]'::jsonb), 'answer', answer, 'clear', clear));
 end if;

 if text_in ~* '^/(help|start)(@\w+)?$' then replies := jsonb_build_array(private.telegram_reply(chat, private.telegram_help()));
 elsif text_in ~* '^/summary(@\w+)?$' then replies := jsonb_build_array(private.telegram_reply(chat, private.telegram_summary_text()));
 else replies := private.telegram_on_text(chat, msg);
 end if;
 return jsonb_build_object('replies', replies);
end $$;

create function private.am_platform_admin_account() returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (select 1 from private.platform_admins a where a.user_id = auth.uid())
$$;
revoke all on function private.am_platform_admin_account() from public, anon, authenticated;
grant execute on function private.am_platform_admin_account() to authenticated;
create function public.am_platform_admin_account() returns boolean language sql stable set search_path = '' as $$ select private.am_platform_admin_account() $$;
revoke all on function public.am_platform_admin_account() from public, anon, authenticated, service_role;
grant execute on function public.am_platform_admin_account() to authenticated;

commit;
