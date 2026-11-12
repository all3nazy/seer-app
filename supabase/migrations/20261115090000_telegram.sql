-- Telegram for the platform admins.
-- 1) Linking: an admin creates a one-time code (10 minutes, only its hash is stored) and sends
--    "/link CODE" to the bot (or opens the bot's start link). The chat is then tied to that admin.
--    Unlinked chats are ignored; an admin who is removed loses the link.
-- 2) Sending: messages wait in private.telegram_outbox; /api/telegram/dispatch sends them (called with
--    a one-time kick from the database right after queueing, by pg_cron every minute as a fallback,
--    or by any scheduler with CRON_SECRET), retrying with backoff. Texts are removed once sent.
-- 3) Updates from Telegram reach /api/telegram/webhook (secret header checked there) and are handled
--    by private.telegram_handle(update), callable by the service role only. Every action runs as the
--    linked admin (auth.uid() is that admin), so the same checks and audit apply as in the console.
-- Forward-only.
begin;

-- 1) Linking ---------------------------------------------------------------------------------------
create table private.telegram_links (
 user_id uuid primary key references auth.users(id) on delete cascade,
 chat_id bigint not null unique,
 username text check (username is null or length(username) <= 64),
 linked_at timestamptz not null default now()
);
create table private.telegram_link_codes (
 code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
 user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null default now() + interval '10 minutes',
 used_at timestamptz
);
alter table private.telegram_links enable row level security;
alter table private.telegram_link_codes enable row level security;
revoke all on private.telegram_links, private.telegram_link_codes from public,anon,authenticated;

-- An admin who is no longer a platform admin is unlinked at once.
create function private.telegram_unlink_removed_admin() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 delete from private.telegram_links where user_id = old.user_id;
 return old;
end $$;
revoke all on function private.telegram_unlink_removed_admin() from public,anon,authenticated;
create trigger telegram_unlink_removed_admin after delete on private.platform_admins for each row execute function private.telegram_unlink_removed_admin();

create function private.telegram_link_code() returns text language plpgsql security definer set search_path = '' as $$
declare code text := private.random_code(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
begin
 perform private.require_platform_admin();
 delete from private.telegram_link_codes where user_id = auth.uid() or expires_at < now() - interval '1 day';
 insert into private.telegram_link_codes(code_hash, user_id) values (private.invite_hash(code), auth.uid());
 insert into private.platform_audit(actor_id, action, detail) values (auth.uid(), 'telegram_link_code', '{}'::jsonb);
 return code;
end $$;

create function private.telegram_unlink() returns void language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 delete from private.telegram_links where user_id = auth.uid();
 insert into private.platform_audit(actor_id, action, detail) values (auth.uid(), 'telegram_unlinked', '{}'::jsonb);
end $$;

create function private.telegram_status() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 return (select jsonb_build_object('linked', l.user_id is not null, 'username', l.username, 'linked_at', l.linked_at,
   'queued', (select count(*) from private.telegram_outbox o where o.status = 'queued'),
   'failed', (select count(*) from private.telegram_outbox o where o.status = 'failed' and o.created_at > now() - interval '1 day'))
  from (select 1) x left join private.telegram_links l on l.user_id = auth.uid());
end $$;

-- 2) Outbox ----------------------------------------------------------------------------------------
create table private.telegram_outbox (
 id bigint generated always as identity primary key,
 chat_id bigint not null,
 body text not null check (length(body) <= 4000),
 buttons jsonb not null default '[]'::jsonb check (jsonb_typeof(buttons) = 'array'),
 context jsonb not null default '{}'::jsonb,
 status text not null default 'queued' check (status in ('queued','sending','sent','failed')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 last_error text check (last_error is null or length(last_error) <= 300),
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
create index telegram_outbox_due_idx on private.telegram_outbox(next_attempt_at) where status = 'queued';
-- Sent messages that can be answered in Telegram (support tickets): reply → thread.
create table private.telegram_messages (
 chat_id bigint not null,
 message_id bigint not null,
 context jsonb not null,
 created_at timestamptz not null default now(),
 primary key (chat_id, message_id)
);
-- A question the bot asked and waits for (e.g. the reason for rejecting a transfer).
create table private.telegram_pending (
 chat_id bigint primary key,
 action text not null,
 target uuid not null,
 expires_at timestamptz not null default now() + interval '15 minutes'
);
-- One-time kicks: the database asks the app to send right away without sharing a secret.
create table private.telegram_kicks (nonce text primary key, created_at timestamptz not null default now());
alter table private.telegram_outbox enable row level security;
alter table private.telegram_messages enable row level security;
alter table private.telegram_pending enable row level security;
alter table private.telegram_kicks enable row level security;
revoke all on private.telegram_outbox, private.telegram_messages, private.telegram_pending, private.telegram_kicks from public,anon,authenticated;

-- Asks the app to send now (best effort; pg_cron sends anyway within a minute).
create function private.telegram_kick() returns void language plpgsql security definer set search_path = '' as $$
declare target text; code text;
begin
 select regexp_replace(c.endpoint, '/api/push$', '/api/telegram/dispatch') into target from private.push_config c limit 1;
 if target is null or target !~ '/api/telegram/dispatch$' or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return; end if;
 if not exists (select 1 from private.telegram_outbox o where o.status = 'queued' and o.next_attempt_at <= now()) then return; end if;
 delete from private.telegram_kicks where created_at < now() - interval '10 minutes';
 code := private.random_code(43, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789');
 insert into private.telegram_kicks(nonce) values (code);
 execute 'select net.http_post($1, $2, ''{}''::jsonb, $3, 5000)' using target, jsonb_build_object('nonce', code), '{"Content-Type":"application/json"}'::jsonb;
exception when others then return;
end $$;

-- Queues a message to every linked platform admin (or one chat).
create function private.telegram_queue(body text, buttons jsonb default '[]'::jsonb, context jsonb default '{}'::jsonb, only_chat bigint default null) returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
 insert into private.telegram_outbox(chat_id, body, buttons, context)
 select l.chat_id, left(body, 4000), coalesce(buttons, '[]'::jsonb), coalesce(context, '{}'::jsonb)
 from private.telegram_links l join private.platform_admins a on a.user_id = l.user_id
 where only_chat is null or l.chat_id = only_chat;
 get diagnostics n = row_count;
 if n > 0 then perform private.telegram_kick(); end if;
 return n;
end $$;

-- For the dispatcher (service role): a batch to send, and the result of each.
create function private.telegram_claim(batch integer) returns table(id bigint, chat_id bigint, body text, buttons jsonb, context jsonb) language plpgsql security definer set search_path = '' as $$
begin
 -- Messages stuck in "sending" (the sender stopped) go back to the queue.
 update private.telegram_outbox o set status = 'queued' where o.status = 'sending' and o.next_attempt_at < now() - interval '5 minutes';
 return query
 update private.telegram_outbox o set status = 'sending', attempts = o.attempts + 1, next_attempt_at = now()
 where o.id in (select x.id from private.telegram_outbox x where x.status = 'queued' and x.next_attempt_at <= now() order by x.id limit greatest(1, least(batch, 50)) for update skip locked)
 returning o.id, o.chat_id, o.body, o.buttons, o.context;
end $$;
create function private.telegram_report(message bigint, ok boolean, telegram_message bigint, error text) returns void language plpgsql security definer set search_path = '' as $$
declare o private.telegram_outbox%rowtype;
begin
 select * into o from private.telegram_outbox x where x.id = message for update;
 if not found then return; end if;
 if ok then
  -- The text is not kept once delivered.
  update private.telegram_outbox set status = 'sent', sent_at = now(), body = '', buttons = '[]'::jsonb, last_error = null where id = message;
  if telegram_message is not null and o.context ? 'thread' then
   insert into private.telegram_messages(chat_id, message_id, context) values (o.chat_id, telegram_message, o.context) on conflict do nothing;
  end if;
 elsif o.attempts >= 5 then
  update private.telegram_outbox set status = 'failed', last_error = left(error, 300) where id = message;
 else
  update private.telegram_outbox set status = 'queued', last_error = left(error, 300), next_attempt_at = now() + make_interval(mins => power(2, o.attempts)::integer) where id = message;
 end if;
end $$;
-- A kick from the database is valid once, for a few minutes.
create function private.telegram_claim_kick(nonce text) returns boolean language plpgsql security definer set search_path = '' as $$
begin
 delete from private.telegram_kicks k where k.nonce = telegram_claim_kick.nonce and k.created_at > now() - interval '10 minutes';
 return found;
end $$;
-- Remembers a message sent directly by the webhook (replies), so it can be answered too.
create function private.telegram_track(chat bigint, telegram_message bigint, context jsonb) returns void language sql security definer set search_path = '' as $$
 insert into private.telegram_messages(chat_id, message_id, context) values (chat, telegram_message, context) on conflict do nothing
$$;

-- 3) Updates from Telegram -------------------------------------------------------------------------
-- What the bot answers right away; the webhook sends these. Each: {chat_id, text, buttons?, reply_to?, track?}.
create function private.telegram_reply(chat bigint, body text, buttons jsonb default null, context jsonb default null) returns jsonb language sql immutable set search_path = '' as $$
 select jsonb_strip_nulls(jsonb_build_object('chat_id', chat, 'text', left(body, 4000), 'buttons', buttons, 'track', context))
$$;

create function private.telegram_help() returns text language sql immutable set search_path = '' as $$
 select 'أوامر بوت سِير:' || chr(10) ||
  '/summary ملخص المنصة الآن' || chr(10) ||
  '/link الرمز لربط هذه المحادثة بحسابك' || chr(10) ||
  '/help هذه القائمة' || chr(10) || chr(10) ||
  'يوصلك هنا: تذاكر الدعم، وطلبات الانضمام، والتحويلات، والمنشآت الجديدة، وتنبيهات المنصة. وللرد على تذكرة اعمل «رد» على رسالتها.'
$$;

-- 4) Join requests from the home page --------------------------------------------------------------
create table private.join_requests (
 id uuid primary key default gen_random_uuid(),
 org_name text not null check (length(btrim(org_name)) between 2 and 120),
 org_type text not null check (org_type in ('school','nursery','kindergarten')),
 city text not null check (length(btrim(city)) between 2 and 60),
 contact_name text not null check (length(btrim(contact_name)) between 2 and 80),
 phone text not null check (phone ~ '^05[0-9]{8}$'),
 students integer check (students is null or students between 1 and 10000),
 status text not null default 'new' check (status in ('new','invited','rejected')),
 client_key text not null,
 invite_id uuid references private.org_invites(id) on delete set null,
 decided_by uuid references auth.users(id) on delete set null,
 decided_at timestamptz,
 created_at timestamptz not null default now()
);
create index join_requests_created_idx on private.join_requests(created_at desc);
create index join_requests_client_idx on private.join_requests(client_key, created_at desc);
alter table private.join_requests enable row level security;
revoke all on private.join_requests from public,anon,authenticated;

-- Anyone may send a request. Spam protection: a hidden field that people leave empty, simple checks,
-- at most 3 requests per device per day, one per phone per day, and 60 per hour in total.
create function private.submit_join_request(org_name text, org_type text, city text, contact_name text, phone text, students integer, website text) returns text language plpgsql security definer set search_path = '' as $$
declare key text := private.invite_client_key(); p text := private.clean_phone(phone);
begin
 if btrim(coalesce(website, '')) <> '' then return 'ok'; end if; -- a bot filled the hidden field: accept silently, keep nothing
 if length(btrim(coalesce(org_name,''))) not between 2 and 120 or length(btrim(coalesce(city,''))) not between 2 and 60 or length(btrim(coalesce(contact_name,''))) not between 2 and 80 then
  raise exception 'Fill in the names' using errcode = '22023';
 end if;
 if org_type is null or org_type not in ('school','nursery','kindergarten') then raise exception 'Choose the type' using errcode = '22023'; end if;
 if p !~ '^05[0-9]{8}$' then raise exception 'Invalid phone' using errcode = '22023'; end if;
 if students is not null and students not between 1 and 10000 then raise exception 'Invalid number of students' using errcode = '22023'; end if;
 if (select count(*) from private.join_requests r where r.client_key = key and r.created_at > now() - interval '1 day') >= 3
  or (select count(*) from private.join_requests r where r.created_at > now() - interval '1 hour') >= 60 then
  raise exception 'Too many requests' using errcode = '54000';
 end if;
 if exists (select 1 from private.join_requests r where r.phone = p and r.created_at > now() - interval '1 day') then return 'ok'; end if;
 insert into private.join_requests(org_name, org_type, city, contact_name, phone, students, client_key)
 values (btrim(org_name), org_type, btrim(city), btrim(contact_name), p, students, key);
 return 'ok';
end $$;

create function private.admin_join_requests() returns table(id uuid, org_name text, org_type text, city text, contact_name text, phone text, students integer, status text, created_at timestamptz, decided_at timestamptz, invite_status text)
language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 return query select r.id, r.org_name, r.org_type, r.city, r.contact_name, r.phone, r.students, r.status, r.created_at, r.decided_at,
  (select private.invite_status(i) from private.org_invites i where i.id = r.invite_id)
 from private.join_requests r order by (r.status = 'new') desc, r.created_at desc limit 200;
end $$;

-- «أرسل دعوة» creates an organization invite (3 free months) from the request; «رفض» closes it.
-- Returns the invite token once (to build the link and the WhatsApp message); it is not stored.
create function private.admin_decide_join_request(request uuid, decision text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r private.join_requests%rowtype; token text;
begin
 perform private.require_platform_admin();
 select * into r from private.join_requests x where x.id = request for update;
 if not found then raise exception 'Unknown request' using errcode = 'P0002'; end if;
 if r.status <> 'new' then raise exception 'Already decided' using errcode = '22023'; end if;
 if decision = 'invite' then
  token := private.admin_create_org_invite(r.org_name, r.org_type, null, 3, left('طلب انضمام: ' || r.city || ' · ' || r.contact_name || ' · ' || r.phone, 500));
  update private.join_requests set status = 'invited', decided_by = auth.uid(), decided_at = now(),
   invite_id = (select i.id from private.org_invites i where i.token_hash = private.invite_hash(token)) where id = request;
 elsif decision = 'reject' then
  update private.join_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = request;
 else
  raise exception 'Unknown decision' using errcode = '22023';
 end if;
 insert into private.platform_audit(actor_id, action, detail) values (auth.uid(), 'join_request_' || decision, jsonb_build_object('request', request, 'org_name', r.org_name));
 return jsonb_strip_nulls(jsonb_build_object('status', case when decision = 'invite' then 'invited' else 'rejected' end, 'token', token,
  'org_name', r.org_name, 'contact_name', r.contact_name, 'phone', r.phone, 'trial_months', 3));
end $$;

-- 5) What reaches Telegram -------------------------------------------------------------------------
create function private.org_type_label(t text) returns text language sql immutable set search_path = '' as $$
 select case t when 'school' then 'مدرسة' when 'nursery' then 'حضانة' when 'kindergarten' then 'روضة' else t end
$$;

-- Support: a new ticket or a user's reply, with the organization, the page and the message.
create function private.telegram_on_support_message() returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.support_threads%rowtype; org text; first boolean;
begin
 if new.from_admin then return new; end if;
 select * into t from public.support_threads x where x.id = new.thread_id;
 select o.name into org from public.organizations o where o.id = t.organization_id;
 first := not exists (select 1 from public.support_messages m where m.thread_id = new.thread_id and m.id <> new.id);
 perform private.telegram_queue(
  (case when first then '🎫 تذكرة دعم جديدة' else '💬 رد في تذكرة' end) || chr(10) ||
  'المنشأة: ' || coalesce(org, '—') || chr(10) ||
  'الموضوع: ' || t.subject || chr(10) ||
  coalesce('الصفحة: ' || t.page || chr(10), '') || chr(10) ||
  left(new.body, 700) || chr(10) || chr(10) || '↩️ اعمل «رد» على هذه الرسالة للرد على المستخدم.',
  jsonb_build_array(jsonb_build_object('text', 'إقفال', 'data', 'sc:' || t.id), jsonb_build_object('text', 'فتح في اللوحة', 'url', '/admin/support/' || t.id)),
  jsonb_build_object('thread', t.id));
 return new;
end $$;
create trigger telegram_on_support_message after insert on public.support_messages for each row execute function private.telegram_on_support_message();

-- A new bank transfer to review.
create function private.telegram_on_payment() returns trigger language plpgsql security definer set search_path = '' as $$
declare org text; plan text;
begin
 select o.name into org from public.organizations o where o.id = new.organization_id;
 select p.name into plan from public.plans p where p.id = new.plan_id;
 perform private.telegram_queue(
  '💳 تحويل بنكي جديد' || chr(10) || 'المنشأة: ' || coalesce(org, '—') || chr(10) ||
  'الباقة: ' || coalesce(plan, '—') || ' · ' || new.months || ' شهر' || chr(10) ||
  'المبلغ: ' || to_char(new.amount, 'FM999G999G990D00') || ' ر.س' || chr(10) || 'المرجع: ' || new.reference,
  jsonb_build_array(jsonb_build_object('text', 'اعتماد', 'data', 'pa:' || new.id), jsonb_build_object('text', 'رفض', 'data', 'pr:' || new.id),
   jsonb_build_object('text', 'فتح في اللوحة', 'url', '/admin/payments')),
  jsonb_build_object('payment', new.id));
 return new;
end $$;
create trigger telegram_on_payment after insert on public.subscription_payments for each row execute function private.telegram_on_payment();

-- Every new organization (sign-up or invite).
create function private.telegram_on_organization() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 perform private.telegram_queue('🏫 تفعّلت منشأة جديدة' || chr(10) || new.name || ' (' || private.org_type_label(new.type) || ')',
  jsonb_build_array(jsonb_build_object('text', 'فتح في اللوحة', 'url', '/admin/subscribers/' || new.id)), jsonb_build_object('organization', new.id));
 return new;
end $$;
create trigger telegram_on_organization after insert on public.organizations for each row execute function private.telegram_on_organization();

-- A join request from the home page.
create function private.telegram_on_join_request() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 perform private.telegram_queue(
  '📝 طلب انضمام للتجربة' || chr(10) || new.org_name || ' (' || private.org_type_label(new.org_type) || ') · ' || new.city || chr(10) ||
  'المسؤول: ' || new.contact_name || ' · ' || new.phone || coalesce(chr(10) || 'عدد الطلاب تقريبًا: ' || new.students, ''),
  jsonb_build_array(jsonb_build_object('text', 'أرسل دعوة', 'data', 'ji:' || new.id), jsonb_build_object('text', 'رفض', 'data', 'jr:' || new.id)),
  jsonb_build_object('join_request', new.id));
 return new;
end $$;
create trigger telegram_on_join_request after insert on private.join_requests for each row execute function private.telegram_on_join_request();

-- Any other notification for the platform admins also goes to Telegram (support, transfers and new
-- organizations above have their own richer messages).
create or replace function private.notify_platform_admins(org uuid, kind text, title text, body text, url text) returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
 for a in select user_id from private.platform_admins loop perform private.notify(org, a.user_id, kind, title, body, url); end loop;
 if kind not in ('support','subscription','signup') then
  perform private.telegram_queue(left(title, 200) || coalesce(chr(10) || left(body, 500), ''),
   case when url like '/%' then jsonb_build_array(jsonb_build_object('text', 'فتح في اللوحة', 'url', url)) else '[]'::jsonb end);
 end if;
end $$;

-- 6) Buttons and replies from the linked admin -----------------------------------------------------
create function private.telegram_on_button(chat bigint, cb jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare data text := coalesce(cb ->> 'data', ''); action text := split_part(data, ':', 1); target uuid; done date; invite jsonb;
begin
 begin target := split_part(data, ':', 2)::uuid; exception when others then return jsonb_build_object('toast', 'زر غير معروف'); end;
 if action = 'sc' then
  perform private.close_support_thread(target);
  return jsonb_build_object('toast', 'أُغلقت التذكرة ✓', 'clear', true);
 elsif action = 'pa' then
  done := private.admin_approve_payment(target);
  return jsonb_build_object('toast', 'اعتُمد التحويل ✓', 'clear', true, 'replies', jsonb_build_array(private.telegram_reply(chat, '✅ اعتُمد التحويل وتفعّل الاشتراك حتى ' || to_char(done, 'YYYY-MM-DD') || '. وصل المشترك إشعار.')));
 elsif action = 'pr' then
  if not exists (select 1 from public.subscription_payments p where p.id = target and p.status = 'pending') then return jsonb_build_object('toast', 'هذا التحويل ما عاد بانتظار القرار', 'clear', true); end if;
  insert into private.telegram_pending(chat_id, action, target) values (chat, 'reject_payment', target)
  on conflict (chat_id) do update set action = excluded.action, target = excluded.target, expires_at = now() + interval '15 minutes';
  return jsonb_build_object('toast', 'اكتب سبب الرفض', 'replies', jsonb_build_array(private.telegram_reply(chat, '✍️ اكتب سبب رفض التحويل في رسالة (يوصل للمشترك كما هو).')));
 elsif action = 'ji' then
  invite := private.admin_decide_join_request(target, 'invite');
  -- The webhook builds the link and the WhatsApp message from this; the token is not stored.
  return jsonb_build_object('toast', 'انشأت الدعوة ✓', 'clear', true, 'replies', jsonb_build_array(jsonb_build_object('chat_id', chat, 'invite', invite)));
 elsif action = 'jr' then
  perform private.admin_decide_join_request(target, 'reject');
  return jsonb_build_object('toast', 'رُفض الطلب', 'clear', true);
 end if;
 return jsonb_build_object('toast', 'زر غير معروف');
exception
 when sqlstate '42501' then return jsonb_build_object('toast', 'ما عندك صلاحية', 'clear', false);
 when sqlstate '22023' or sqlstate 'P0002' then return jsonb_build_object('toast', 'تم التعامل مع هذا من قبل', 'clear', true);
end $$;

create function private.telegram_on_text(chat bigint, msg jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare body text := btrim(coalesce(msg ->> 'text', '')); p private.telegram_pending%rowtype; context jsonb;
begin
 if body = '' then return '[]'::jsonb; end if;
 -- Waiting for an answer (the reason for rejecting a transfer).
 select * into p from private.telegram_pending x where x.chat_id = chat and x.expires_at > now();
 if found then
  delete from private.telegram_pending where chat_id = chat;
  if p.action = 'reject_payment' then
   begin
    perform private.admin_reject_payment(p.target, body);
    return jsonb_build_array(private.telegram_reply(chat, '❌ رُفض التحويل ووصل السبب للمشترك.'));
   exception when others then
    return jsonb_build_array(private.telegram_reply(chat, 'تعذّر رفض التحويل (ربما تم التعامل معه، أو السبب قصير جدًا).'));
   end;
  end if;
 end if;
 -- A reply to a ticket message: goes to the user as a reply from the Seer team.
 if msg ? 'reply_to_message' then
  select m.context into context from private.telegram_messages m where m.chat_id = chat and m.message_id = (msg -> 'reply_to_message' ->> 'message_id')::bigint;
  if context ? 'thread' then
   begin
    perform private.reply_support((context ->> 'thread')::uuid, left(body, 2000));
    return jsonb_build_array(private.telegram_reply(chat, '✓ وصل ردك للمستخدم داخل المنصة.'));
   exception when others then
    return jsonb_build_array(private.telegram_reply(chat, 'تعذّر إرسال الرد: التذكرة مغلقة أو ما عاد لك صلاحية عليها.'));
   end;
  end if;
 end if;
 return jsonb_build_array(private.telegram_reply(chat, 'للرد على تذكرة اعمل «رد» على رسالتها. وللأوامر أرسل /help'));
end $$;

-- 7) Alerts and the daily summary ------------------------------------------------------------------
-- The same alert at most once an hour.
create table private.telegram_alerts (key text primary key, sent_at timestamptz not null default now());
alter table private.telegram_alerts enable row level security;
revoke all on private.telegram_alerts from public,anon,authenticated;
create function private.telegram_alert_once(alert_key text, body text, buttons jsonb default '[]'::jsonb) returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if exists (select 1 from private.telegram_alerts a where a.key = alert_key and a.sent_at > now() - interval '1 hour') then return false; end if;
 insert into private.telegram_alerts as a (key) values (alert_key) on conflict on constraint telegram_alerts_pkey do update set sent_at = now();
 perform private.telegram_queue(body, buttons);
 return true;
end $$;

-- A new runtime error, or one that came back after being resolved (messages are already masked).
create function private.telegram_on_system_error() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if tg_op = 'INSERT' or (new.regressed and not old.regressed) or (new.status = 'new' and old.status <> 'new') then
  perform private.telegram_alert_once('error:' || new.fingerprint,
   '⚠️ ' || case when tg_op = 'INSERT' then 'خطأ تشغيل جديد' else 'رجع خطأ تشغيل' end || chr(10) ||
   left(new.message, 300) || coalesce(chr(10) || 'المسار: ' || new.route, ''),
   jsonb_build_array(jsonb_build_object('text', 'سجل الأخطاء', 'url', '/dashboard/health')));
 end if;
 return new;
end $$;
create trigger telegram_on_system_error after insert or update of regressed, status on public.system_errors for each row execute function private.telegram_on_system_error();

-- Platform-wide health checks every 15 minutes; each failing check alerts at most once an hour.
create function private.telegram_health_scan() returns integer language plpgsql security definer set search_path = '' as $$
declare sent integer := 0; n bigint;
begin
 select count(*) into n from public.message_outbox m where m.status = 'sending' and coalesce(m.claimed_at, m.created_at) < now() - interval '30 minutes';
 if n > 0 and private.telegram_alert_once('health:messages_stuck', '🩺 فحص الصحة: ' || n || ' رسالة عالقة أثناء الإرسال لأكثر من نصف ساعة.') then sent := sent + 1; end if;
 select count(*) into n from public.payment_intents p where p.status = 'needs_review';
 if n > 0 and private.telegram_alert_once('health:payments_review', '🩺 فحص الصحة: ' || n || ' دفعة إلكترونية تحتاج مراجعة.') then sent := sent + 1; end if;
 select count(*) into n from public.invoices i where i.paid_total <> coalesce((select sum(p.amount) from public.payments p where p.invoice_id = i.id), 0);
 if n > 0 and private.telegram_alert_once('health:invoice_balance', '🩺 فحص الصحة: ' || n || ' فاتورة مجموع مدفوعاتها لا يطابق المسجّل.') then sent := sent + 1; end if;
 select count(*) into n from private.telegram_outbox o where o.status = 'failed' and o.created_at > now() - interval '1 day';
 if n > 0 and private.telegram_alert_once('health:telegram_failed', '🩺 فحص الصحة: ' || n || ' رسالة تيليقرام فشل إرسالها اليوم.') then sent := sent + 1; end if;
 -- Housekeeping.
 delete from private.telegram_outbox where status in ('sent','failed') and created_at < now() - interval '7 days';
 delete from private.telegram_messages where created_at < now() - interval '90 days';
 delete from private.telegram_pending where expires_at < now();
 delete from private.telegram_link_codes where expires_at < now() - interval '1 day';
 perform private.telegram_kick();
 return sent;
end $$;

-- 08:00 Riyadh: the summary, and the subscriptions ending within 7 days.
create function private.telegram_daily() returns integer language plpgsql security definer set search_path = '' as $$
declare ending text;
begin
 perform private.telegram_queue('☀️ ' || private.telegram_summary_text(), jsonb_build_array(jsonb_build_object('text', 'لوحة المسؤول', 'url', '/admin')));
 select string_agg('• ' || o.name || ' — ' || case when s.ends_on = private.riyadh_today() then 'اليوم' else 'بعد ' || (s.ends_on - private.riyadh_today()) || ' يوم' end ||
   case when s.status = 'trial' then ' (تجربة)' else '' end, chr(10) order by s.ends_on)
 into ending
 from public.subscriptions s join public.organizations o on o.id = s.organization_id
 where s.status <> 'suspended' and s.ends_on between private.riyadh_today() and private.riyadh_today() + 7;
 if ending is not null then
  perform private.telegram_queue('⏳ اشتراكات تنتهي خلال ٧ أيام:' || chr(10) || ending, jsonb_build_array(jsonb_build_object('text', 'المشتركين', 'url', '/admin/subscribers')));
 end if;
 return 1;
end $$;

-- The platform at a glance (/summary and the daily summary). Counts only; no names of children.
create function private.telegram_summary_text() returns text language sql stable security definer set search_path = '' as $$
 select 'ملخص سِير — ' || to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || chr(10) ||
  '• تذاكر تنتظر ردّك: ' || (select count(*) from public.support_threads t where t.status = 'open' and t.last_sender = 'user') ||
  ' (مفتوحة: ' || (select count(*) from public.support_threads t where t.status = 'open') || ')' || chr(10) ||
  '• طلبات انضمام جديدة: ' || (select count(*) from private.join_requests r where r.status = 'new') || chr(10) ||
  '• تحويلات بانتظار الاعتماد: ' || (select count(*) from public.subscription_payments p where p.status = 'pending') || chr(10) ||
  '• منشآت نشطة: ' || (select count(*) from public.subscriptions s where private.org_access(s.organization_id) in ('active','grace')) ||
  ' (منها تجربة: ' || (select count(*) from public.subscriptions s where s.status = 'trial' and private.org_access(s.organization_id) = 'active') || ')' || chr(10) ||
  '• تنتهي خلال ٧ أيام: ' || (select count(*) from public.subscriptions s where s.status <> 'suspended' and s.ends_on between private.riyadh_today() and private.riyadh_today() + 7) || chr(10) ||
  '• أخطاء تشغيل آخر ٢٤ ساعة: ' || (select count(*) from public.system_errors e where e.last_seen > now() - interval '1 day' and e.status in ('new','known'))
$$;

-- Handles one update. Returns {replies: [...], answer?: {id, text}, clear?: {chat_id, message_id}}.
-- Unlinked chats get nothing back, except the linking commands.
create function private.telegram_handle(update jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
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
 perform set_config('request.jwt.claims', jsonb_build_object('sub', admin::text, 'role', 'authenticated')::text, true);

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

revoke all on function private.telegram_link_code(), private.telegram_unlink(), private.telegram_status(), private.telegram_kick(), private.telegram_queue(text,jsonb,jsonb,bigint),
 private.telegram_claim(integer), private.telegram_report(bigint,boolean,bigint,text), private.telegram_claim_kick(text), private.telegram_track(bigint,bigint,jsonb),
 private.telegram_reply(bigint,text,jsonb,jsonb), private.telegram_help() from public,anon,authenticated;
revoke all on function private.submit_join_request(text,text,text,text,text,integer,text), private.admin_join_requests(), private.admin_decide_join_request(uuid,text),
 private.org_type_label(text), private.telegram_on_support_message(), private.telegram_on_payment(), private.telegram_on_organization(), private.telegram_on_join_request(),
 private.telegram_on_button(bigint,jsonb), private.telegram_on_text(bigint,jsonb), private.telegram_alert_once(text,text,jsonb), private.telegram_on_system_error(),
 private.telegram_health_scan(), private.telegram_daily(), private.telegram_summary_text(), private.telegram_handle(jsonb) from public,anon,authenticated;
grant execute on function private.telegram_link_code(), private.telegram_unlink(), private.telegram_status(), private.admin_join_requests(), private.admin_decide_join_request(uuid,text) to authenticated;
grant execute on function private.telegram_claim_kick(text), private.submit_join_request(text,text,text,text,text,integer,text) to anon, authenticated;
grant execute on function private.telegram_handle(jsonb), private.telegram_claim(integer), private.telegram_report(bigint,boolean,bigint,text), private.telegram_track(bigint,bigint,jsonb) to service_role;
grant usage on schema private to service_role;

-- Public entry points ------------------------------------------------------------------------------
-- Platform admins (console).
create function public.telegram_link_code() returns text language sql set search_path = '' as $$ select private.telegram_link_code() $$;
create function public.telegram_unlink() returns void language sql set search_path = '' as $$ select private.telegram_unlink() $$;
create function public.telegram_status() returns jsonb language sql stable set search_path = '' as $$ select private.telegram_status() $$;
create function public.admin_join_requests() returns table(id uuid, org_name text, org_type text, city text, contact_name text, phone text, students integer, status text, created_at timestamptz, decided_at timestamptz, invite_status text)
 language sql stable set search_path = '' as $$ select * from private.admin_join_requests() $$;
create function public.admin_decide_join_request(request uuid, decision text) returns jsonb language sql set search_path = '' as $$ select private.admin_decide_join_request(request, decision) $$;
-- Anyone (home page form).
create function public.submit_join_request(org_name text, org_type text, city text, contact_name text, phone text, students integer default null, website text default null) returns text
 language sql set search_path = '' as $$ select private.submit_join_request(org_name, org_type, city, contact_name, phone, students, website) $$;
-- The app's Telegram routes: the kick check is public (a one-time code); the rest is service role only.
create function public.telegram_claim_kick(nonce text) returns boolean language sql set search_path = '' as $$ select private.telegram_claim_kick(nonce) $$;
create function public.telegram_handle(update jsonb) returns jsonb language sql set search_path = '' as $$ select private.telegram_handle(update) $$;
create function public.telegram_claim(batch integer default 20) returns table(id bigint, chat_id bigint, body text, buttons jsonb, context jsonb) language sql set search_path = '' as $$ select * from private.telegram_claim(batch) $$;
create function public.telegram_report(message bigint, ok boolean, telegram_message bigint default null, error text default null) returns void language sql set search_path = '' as $$ select private.telegram_report(message, ok, telegram_message, error) $$;
create function public.telegram_track(chat bigint, telegram_message bigint, context jsonb) returns void language sql set search_path = '' as $$ select private.telegram_track(chat, telegram_message, context) $$;
revoke all on function public.telegram_link_code(), public.telegram_unlink(), public.telegram_status(), public.admin_join_requests(), public.admin_decide_join_request(uuid,text),
 public.submit_join_request(text,text,text,text,text,integer,text), public.telegram_claim_kick(text), public.telegram_handle(jsonb), public.telegram_claim(integer),
 public.telegram_report(bigint,boolean,bigint,text), public.telegram_track(bigint,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.telegram_link_code(), public.telegram_unlink(), public.telegram_status(), public.admin_join_requests(), public.admin_decide_join_request(uuid,text) to authenticated;
grant execute on function public.submit_join_request(text,text,text,text,text,integer,text), public.telegram_claim_kick(text) to anon, authenticated;
grant execute on function public.telegram_handle(jsonb), public.telegram_claim(integer), public.telegram_report(bigint,boolean,bigint,text), public.telegram_track(bigint,bigint,jsonb) to service_role;

do $$ begin
 perform cron.schedule('seer-telegram-health', '*/15 * * * *', 'select private.telegram_health_scan()');
 perform cron.schedule('seer-telegram-kick', '* * * * *', 'select private.telegram_kick()');
 perform cron.schedule('seer-telegram-daily', '0 5 * * *', 'select private.telegram_daily()');
exception when others then null;
end $$;
commit;
