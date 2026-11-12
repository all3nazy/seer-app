-- Reply templates for support.
-- 0) Fix: telegram_claim_kick was not executable by service_role, so /api/telegram/dispatch answered
--    401 to the database's kick and messages stayed queued. (Already applied on the live database.)
-- 1) private.support_templates: short title, the reply in everyday Saudi Arabic, an optional page of
--    the platform (kept relative, e.g. /dashboard/team, made absolute on the official address when
--    sent), order, active, and keywords for suggestions. Platform admins only. Seeded with templates
--    for the common questions, written from the platform's real pages and buttons.
-- 2) Telegram: «قوالب الرد» under every ticket message lists the templates as buttons (pages of 6,
--    the suggested one first); choosing one sends it as the reply (reply_support, as the linked
--    admin, audited). /templates lists them. The webhook passes the official address.
-- Forward-only.
begin;

-- 0) The kick check must be callable by the dispatcher (service role).
grant execute on function private.telegram_claim_kick(text) to service_role;
grant execute on function public.telegram_claim_kick(text) to service_role;

-- 1) Templates -------------------------------------------------------------------------------------
create table private.support_templates (
 id bigint generated always as identity primary key,
 title text not null check (length(btrim(title)) between 2 and 60),
 body text not null check (length(btrim(body)) between 5 and 1500),
 path text check (path is null or path ~ '^/dashboard(/[a-z0-9-]+)*(#[a-z-]+)?$'),
 keywords text[] not null default '{}' check (array_position(keywords, null) is null),
 sort_order integer not null default 0,
 is_active boolean not null default true,
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);
alter table private.support_templates enable row level security;
revoke all on private.support_templates from public,anon,authenticated;

-- Arabic text in one form for matching: no diacritics, one alef, ه for ة, ي for ى.
create function private.normalize_ar(value text) returns text language sql immutable set search_path = '' as $$
 select regexp_replace(translate(lower(coalesce(value, '')), 'أإآٱةى', 'اااايهي'), '[ًٌٍَُِّْـ]', '', 'g')
$$;

-- The reply as sent: the text, then the page as a full link on the official address.
create function private.support_template_text(t private.support_templates, site text) returns text language sql stable set search_path = '' as $$
 select btrim(t.body) || case when t.path is null then '' else chr(10) || chr(10) || '🔗 ' ||
  rtrim(coalesce(nullif(site, ''), nullif(current_setting('seer.site', true), ''), 'https://seersa.vercel.app'), '/') || t.path end
$$;

-- The template that best matches a ticket (its subject and the user's latest messages): the most
-- keywords found, then the template order. Null when no keyword matches.
create function private.support_template_suggestion(thread uuid) returns bigint language sql stable security definer set search_path = '' as $$
 with ticket as (
  select private.normalize_ar(t.subject || ' ' || coalesce((select string_agg(m.body, ' ') from (select x.body from public.support_messages x
   where x.thread_id = t.id and not x.from_admin order by x.created_at desc limit 5) m), '')) as words
  from public.support_threads t where t.id = thread
 ), scored as (
  select s.id, s.sort_order, (select count(*) from unnest(s.keywords) k where length(btrim(k)) > 1 and ticket.words like '%' || private.normalize_ar(btrim(k)) || '%') as hits
  from private.support_templates s, ticket where s.is_active
 )
 select id from scored where hits > 0 order by hits desc, sort_order, id limit 1
$$;

create function private.admin_support_templates(for_thread uuid) returns table(id bigint, title text, body text, path text, keywords text[], sort_order integer, is_active boolean, suggested boolean)
language plpgsql stable security definer set search_path = '' as $$
declare best bigint := case when for_thread is null then null else private.support_template_suggestion(for_thread) end;
begin
 perform private.require_platform_admin();
 return query select s.id, s.title, s.body, s.path, s.keywords, s.sort_order, s.is_active, s.id = best
 from private.support_templates s order by (s.id = best) desc nulls last, s.sort_order, s.id;
end $$;

-- Add (template null) or edit a template. Audited.
create function private.admin_save_support_template(template bigint, title text, body text, path text, keywords text[], sort_order integer, is_active boolean) returns bigint language plpgsql security definer set search_path = '' as $$
declare saved bigint; clean_path text := nullif(btrim(coalesce(path, '')), '');
begin
 perform private.require_platform_admin();
 if length(btrim(coalesce(title, ''))) not between 2 and 60 or length(btrim(coalesce(body, ''))) not between 5 and 1500 then raise exception 'Check the title and the text' using errcode = '22023'; end if;
 if clean_path is not null and clean_path !~ '^/dashboard(/[a-z0-9-]+)*(#[a-z-]+)?$' then raise exception 'The page must be inside the platform' using errcode = '22023'; end if;
 if template is null then
  insert into private.support_templates(title, body, path, keywords, sort_order, is_active, updated_by)
  values (btrim(title), btrim(body), clean_path, coalesce(keywords, '{}'), coalesce(sort_order, 0), coalesce(is_active, true), auth.uid()) returning id into saved;
 else
  update private.support_templates s set title = btrim(admin_save_support_template.title), body = btrim(admin_save_support_template.body), path = clean_path,
   keywords = coalesce(admin_save_support_template.keywords, s.keywords), sort_order = coalesce(admin_save_support_template.sort_order, s.sort_order),
   is_active = coalesce(admin_save_support_template.is_active, s.is_active), updated_by = auth.uid(), updated_at = now()
  where s.id = template returning s.id into saved;
  if saved is null then raise exception 'Unknown template' using errcode = 'P0002'; end if;
 end if;
 insert into private.platform_audit(actor_id, action, detail) values (auth.uid(), case when template is null then 'template_created' else 'template_updated' end,
  jsonb_build_object('template', saved, 'title', btrim(title), 'active', coalesce(is_active, true)));
 return saved;
end $$;

-- Seed: the common questions, from the real pages.
insert into private.support_templates(title, body, path, keywords, sort_order) values
 ('إضافة موظف أو مستخدم', 'هلا والله 🌿 تضيف الموظف بدون إيميل:' || chr(10) || '١. افتح «الفريق» من القائمة.' || chr(10) || '٢. اضغط «إنشاء رابط انضمام» واختر دوره (موظف أو مدير).' || chr(10) || '٣. أرسل الرابط للموظف على الواتساب، ويختار اسم مستخدم وكلمة مرور ويدخل على طول.',
  '/dashboard/team', array['موظف','موظفه','مستخدم','اضيف','اضافه','الفريق','معلمه','معلم','حساب','دعوه'], 10),
 ('إضافة طالب واستيراد Excel', 'أكيد 👍 من «الطلاب»:' || chr(10) || '• لطالب واحد: «إضافة طالب» وعبّ بياناته.' || chr(10) || '• لأكثر من طالب: «استيراد من Excel»، ارفع الملف أو الصقه، وراجع الصفوف قبل الحفظ.',
  '/dashboard/children', array['طالب','طلاب','الطلاب','اكسل','excel','استيراد','ملف','اضيف طالب'], 20),
 ('ربط ولي الأمر والمصرّح لهم بالاستلام', 'من ملف الطالب:' || chr(10) || '١. افتح «الطلاب» واختر الطالب.' || chr(10) || '٢. في قسم أولياء الأمور اربط ولي الأمر (أو أضفه من «السجلات» أولًا).' || chr(10) || '٣. في «المصرّح لهم بالاستلام» أضف السائق أو القريب، وما يقدر أحد غيرهم يستلم الطالب.',
  '/dashboard/children', array['ولي الامر','ولي امر','اولياء','مصرح','استلام','يستلم','السايق','السائق','ربط'], 30),
 ('الفصول والهيكل الدراسي', 'من «الهيكل الدراسي»:' || chr(10) || '١. أضف السنة الدراسية.' || chr(10) || '٢. «إضافة صف» ثم «إضافة شعبة» بسعتها ورائدها.' || chr(10) || '٣. وزّع الطلاب على الشعب، وتظهر بعدها في الحضور ومتابعة الفصول.',
  '/dashboard/academics', array['فصل','فصول','شعبه','شعب','صف','صفوف','الهيكل','سنه دراسيه'], 40),
 ('تسجيل الحضور', 'من «الحضور»:' || chr(10) || '١. اختر الفصل والتاريخ.' || chr(10) || '٢. اختر لكل طالب: حاضر، متأخر، غائب، أو بعذر.' || chr(10) || '٣. أو اضغط «تحديد الباقين حاضرين» واحفظ.' || chr(10) || 'تعديل الأيام السابقة للمدير فقط.',
  '/dashboard/attendance', array['حضور','الحضور','غياب','غايب','متاخر','تاخير','تحضير'], 50),
 ('التقرير اليومي', 'من «التقرير اليومي»:' || chr(10) || '١. اختر الطفل.' || chr(10) || '٢. عبّ المزاج والأكل والنوم والأنشطة.' || chr(10) || '٣. احفظ، ويقدر الأهل يشوفونه في بوابتهم أو ترسله لهم واتساب.',
  '/dashboard/daily', array['تقرير يومي','التقرير اليومي','الاكل','النوم','المزاج','تقرير'], 60),
 ('الإعلانات', 'من «الإعلانات»:' || chr(10) || '١. اضغط «إعلان جديد» واختر لمين: الموظفين أو أولياء الأمور أو الكل.' || chr(10) || '٢. انشره.' || chr(10) || '٣. لإعلانات الأهالي اضغط «إرسال للأهالي» يوصل كل ولي أمر برسالة.',
  '/dashboard/announcements', array['اعلان','اعلانات','تعميم','الاهالي','رساله للاهالي'], 70),
 ('رابط بوابة ولي الأمر', 'كل ولي أمر له رابط خاص بدون كلمة مرور:' || chr(10) || '١. افتح ملف الطالب من «الطلاب».' || chr(10) || '٢. عند ولي الأمر اضغط «رابط البوابة».' || chr(10) || '٣. انسخه أو أرسله له واتساب، ويشوف فيه الحضور والتقارير والفواتير.',
  '/dashboard/children', array['بوابه','البوابه','رابط ولي الامر','الاهل يشوفون','تطبيق الاهل'], 80),
 ('تشغيل وإطفاء الأقسام', 'من «الإعدادات» ← تبويب «المنشأة» (للمالك):' || chr(10) || '• شغّل أو أطفِ أي قسم من المفاتيح.' || chr(10) || '• القسم المطفي يختفي من القائمة ومن المساعد لكل الفريق، وبياناته تبقى محفوظة.',
  '/dashboard/settings#organization', array['قسم','الاقسام','اطفي','اشغل','مخفي','اختفى','ما يطلع','القائمه'], 90),
 ('تغيير كلمة المرور', 'لتغيير كلمة مرورك: «الإعدادات» ← «حسابي» ← «تغيير كلمة المرور».' || chr(10) || 'وإذا نسيها موظف: المدير يفتح «الفريق»، يختار الموظف، ويعيّن له «كلمة مرور جديدة».',
  '/dashboard/settings#account', array['كلمه المرور','كلمه السر','باسورد','نسيت','ما اقدر ادخل','الدخول'], 100),
 ('تثبيت التطبيق والإشعارات', 'من «الإعدادات» ← «الجهاز والإشعارات»:' || chr(10) || '١. «سِير على جهازك»: اتبع خطوات جهازك للتثبيت على الشاشة الرئيسية.' || chr(10) || '٢. اضغط «تفعيل الإشعارات على هذا الجهاز» ووافق.' || chr(10) || 'على الآيفون والآيباد: ثبّته أولًا ثم فعّل الإشعارات من داخله.',
  '/dashboard/settings#device', array['تثبيت','تطبيق','ايقونه','اشعار','الاشعارات','تنبيهات','جوال','ايفون'], 110),
 ('المالية والفواتير', 'من «المالية»:' || chr(10) || '١. أضف بنود الرسوم.' || chr(10) || '٢. «فاتورة جديدة» للطالب، ثم «إصدار الفاتورة».' || chr(10) || '٣. سجّل الدفعات مع الإيصال، وشارك رابط الفاتورة مع ولي الأمر.',
  '/dashboard/finance', array['فاتوره','فواتير','رسوم','دفعه','الماليه','سداد','ايصال'], 120),
 ('النقل', 'من «النقل»:' || chr(10) || '١. «إضافة باص» مع السائق.' || chr(10) || '٢. «إضافة مسار» وحدّد محطة كل طالب.' || chr(10) || '٣. في «رحلات اليوم» يبدأ السائق الرحلة ويسجّل الصعود والنزول.',
  '/dashboard/transport', array['نقل','باص','باصات','حافله','مسار','رحله','السايق'], 130),
 ('الاشتراك', 'تشوف حالة اشتراك منشأتك ومدته من «الاشتراك» أسفل القائمة.' || chr(10) || 'خلال المرحلة التجريبية الاشتراك مجاني ولا يحتاج أي تحويل، وإذا تبي تمديد قلنا ونمدّده لك.',
  '/dashboard/billing', array['اشتراك','الاشتراك','تجديد','ينتهي','الباقه','تمديد','مجاني'], 140);

-- 2) Telegram --------------------------------------------------------------------------------------
-- Ticket messages get «قوالب الرد».
create or replace function private.telegram_on_support_message() returns trigger language plpgsql security definer set search_path = '' as $$
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
  jsonb_build_array(jsonb_build_object('text', 'قوالب الرد', 'data', 'tl:' || t.id || ':0'),
   jsonb_build_object('text', 'إقفال', 'data', 'sc:' || t.id), jsonb_build_object('text', 'فتح في اللوحة', 'url', '/admin/support/' || t.id)),
  jsonb_build_object('thread', t.id));
 return new;
end $$;

-- The templates as buttons for one ticket: the suggested one first, 6 per page, with paging.
create function private.telegram_template_menu(chat bigint, thread uuid, page integer) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare best bigint := private.support_template_suggestion(thread); total integer; buttons jsonb := '[]'::jsonb; r record; per integer := 6;
begin
 select count(*) into total from private.support_templates s where s.is_active and s.id is distinct from best;
 page := greatest(0, least(coalesce(page, 0), greatest(0, (total - 1) / per)));
 if best is not null and page = 0 then
  select jsonb_build_array(jsonb_build_object('text', '⭐ المقترح: ' || s.title, 'data', 'ts:' || thread || ':' || s.id, 'wide', true)) into buttons from private.support_templates s where s.id = best;
 end if;
 for r in select s.id, s.title from private.support_templates s where s.is_active and s.id is distinct from best order by s.sort_order, s.id offset page * per limit per loop
  buttons := buttons || jsonb_build_array(jsonb_build_object('text', r.title, 'data', 'ts:' || thread || ':' || r.id, 'wide', true));
 end loop;
 if page > 0 then buttons := buttons || jsonb_build_array(jsonb_build_object('text', '‹ السابق', 'data', 'tl:' || thread || ':' || (page - 1))); end if;
 if (page + 1) * per < total then buttons := buttons || jsonb_build_array(jsonb_build_object('text', 'التالي ›', 'data', 'tl:' || thread || ':' || (page + 1))); end if;
 if jsonb_array_length(buttons) = 0 then
  return private.telegram_reply(chat, 'ما فيه قوالب مفعّلة. أضفها من لوحة المسؤول ← الدعم ← القوالب.', jsonb_build_array(jsonb_build_object('text', 'القوالب', 'url', '/admin/support/templates')));
 end if;
 return private.telegram_reply(chat, '📋 اختر قالبًا يُرسل كرد على التذكرة' || case when total > per then ' (صفحة ' || (page + 1) || ' من ' || ((total - 1) / per + 1) || ')' else '' end || ':', buttons);
end $$;

create or replace function private.telegram_help() returns text language sql immutable set search_path = '' as $$
 select 'أوامر بوت سِير:' || chr(10) ||
  '/summary ملخص المنصة الآن' || chr(10) ||
  '/templates قوالب الرد الجاهزة' || chr(10) ||
  '/link الرمز لربط هذه المحادثة بحسابك' || chr(10) ||
  '/help هذه القائمة' || chr(10) || chr(10) ||
  'يوصلك هنا: تذاكر الدعم، وطلبات الانضمام، والتحويلات، والمنشآت الجديدة، وتنبيهات المنصة. وللرد على تذكرة اعمل «رد» على رسالتها، أو اختر من «قوالب الرد».'
$$;

create or replace function private.telegram_on_button(chat bigint, cb jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare data text := coalesce(cb ->> 'data', ''); action text := split_part(data, ':', 1); target uuid; done date; invite jsonb; tpl private.support_templates%rowtype;
begin
 begin target := split_part(data, ':', 2)::uuid; exception when others then return jsonb_build_object('toast', 'زر غير معروف'); end;
 if action = 'tl' then
  perform private.require_platform_admin();
  return jsonb_build_object('toast', 'قوالب الرد', 'replies', jsonb_build_array(private.telegram_template_menu(chat, target, nullif(split_part(data, ':', 3), '')::integer)));
 elsif action = 'ts' then
  perform private.require_platform_admin();
  select * into tpl from private.support_templates s where s.id = nullif(split_part(data, ':', 3), '')::bigint and s.is_active;
  if not found then return jsonb_build_object('toast', 'القالب غير موجود أو معطّل'); end if;
  perform private.reply_support(target, private.support_template_text(tpl, null));
  perform private.telegram_audit('template_reply', target);
  return jsonb_build_object('toast', 'أُرسل القالب ✓', 'clear', true, 'replies', jsonb_build_array(private.telegram_reply(chat, '✓ أُرسل قالب «' || tpl.title || '» كرد على التذكرة.')));
 elsif action = 'sc' then
  perform private.close_support_thread(target);
  perform private.telegram_audit('close_ticket', target);
  return jsonb_build_object('toast', 'أُغلقت التذكرة ✓', 'clear', true);
 elsif action = 'pa' then
  done := private.admin_approve_payment(target);
  perform private.telegram_audit('approve_payment', target);
  return jsonb_build_object('toast', 'اعتُمد التحويل ✓', 'clear', true, 'replies', jsonb_build_array(private.telegram_reply(chat, '✅ اعتُمد التحويل وتفعّل الاشتراك حتى ' || to_char(done, 'YYYY-MM-DD') || '. وصل المشترك إشعار.')));
 elsif action = 'pr' then
  if not exists (select 1 from public.subscription_payments p where p.id = target and p.status = 'pending') then return jsonb_build_object('toast', 'هذا التحويل ما عاد بانتظار القرار', 'clear', true); end if;
  insert into private.telegram_pending(chat_id, action, target) values (chat, 'reject_payment', target)
  on conflict (chat_id) do update set action = excluded.action, target = excluded.target, expires_at = now() + interval '15 minutes';
  return jsonb_build_object('toast', 'اكتب سبب الرفض', 'replies', jsonb_build_array(private.telegram_reply(chat, '✍️ اكتب سبب رفض التحويل في رسالة (يوصل للمشترك كما هو).')));
 elsif action = 'ji' then
  invite := private.admin_decide_join_request(target, 'invite');
  perform private.telegram_audit('invite_join_request', target);
  -- The webhook builds the link and the WhatsApp message from this; the token is not stored.
  return jsonb_build_object('toast', 'انشأت الدعوة ✓', 'clear', true, 'replies', jsonb_build_array(jsonb_build_object('chat_id', chat, 'invite', invite)));
 elsif action = 'jr' then
  perform private.admin_decide_join_request(target, 'reject');
  perform private.telegram_audit('reject_join_request', target);
  return jsonb_build_object('toast', 'رُفض الطلب', 'clear', true);
 end if;
 return jsonb_build_object('toast', 'زر غير معروف');
exception
 when sqlstate '42501' then return jsonb_build_object('toast', 'ما عندك صلاحية', 'clear', false);
 when sqlstate '22023' or sqlstate 'P0002' then return jsonb_build_object('toast', 'تم التعامل مع هذا من قبل (أو التذكرة مغلقة)', 'clear', true);
end $$;

create or replace function private.telegram_on_text(chat bigint, msg jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare body text := btrim(coalesce(msg ->> 'text', '')); p private.telegram_pending%rowtype; context jsonb; listing text;
begin
 if body = '' then return '[]'::jsonb; end if;
 -- /templates: the active templates and their pages.
 if body ~* '^/templates(@\w+)?$' then
  select string_agg('• ' || s.title || coalesce(' — ' || s.path, ''), chr(10) order by s.sort_order, s.id) into listing from private.support_templates s where s.is_active;
  return jsonb_build_array(private.telegram_reply(chat, coalesce('📋 قوالب الرد (تختارها من زر «قوالب الرد» تحت أي تذكرة):' || chr(10) || listing, 'ما فيه قوالب مفعّلة.'),
   jsonb_build_array(jsonb_build_object('text', 'إدارة القوالب', 'url', '/admin/support/templates'))));
 end if;
 -- Waiting for an answer (the reason for rejecting a transfer).
 select * into p from private.telegram_pending x where x.chat_id = chat and x.expires_at > now();
 if found then
  delete from private.telegram_pending where chat_id = chat;
  if p.action = 'reject_payment' then
   begin
    perform private.admin_reject_payment(p.target, body);
    perform private.telegram_audit('reject_payment', p.target);
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
    perform private.telegram_audit('reply_ticket', (context ->> 'thread')::uuid);
    return jsonb_build_array(private.telegram_reply(chat, '✓ وصل ردك للمستخدم داخل المنصة.'));
   exception when others then
    return jsonb_build_array(private.telegram_reply(chat, 'تعذّر إرسال الرد: التذكرة مغلقة أو ما عاد لك صلاحية عليها.'));
   end;
  end if;
 end if;
 return jsonb_build_array(private.telegram_reply(chat, 'للرد على تذكرة اعمل «رد» على رسالتها أو اختر من «قوالب الرد». وللأوامر أرسل /help'));
end $$;

-- The webhook passes the official address, used for template links while handling this update.
create function private.telegram_handle_at(update jsonb, site text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if site ~ '^https://[a-z0-9.-]+(:\d+)?$' then perform set_config('seer.site', site, true); end if;
 return private.telegram_handle(update);
end $$;

revoke all on function private.normalize_ar(text), private.support_template_text(private.support_templates,text), private.support_template_suggestion(uuid),
 private.admin_support_templates(uuid), private.admin_save_support_template(bigint,text,text,text,text[],integer,boolean), private.telegram_template_menu(bigint,uuid,integer),
 private.telegram_handle_at(jsonb,text) from public,anon,authenticated;
grant execute on function private.admin_support_templates(uuid), private.admin_save_support_template(bigint,text,text,text,text[],integer,boolean) to authenticated;
grant execute on function private.telegram_handle_at(jsonb,text) to service_role;

create function public.admin_support_templates(for_thread uuid default null) returns table(id bigint, title text, body text, path text, keywords text[], sort_order integer, is_active boolean, suggested boolean)
 language sql stable set search_path = '' as $$ select * from private.admin_support_templates(for_thread) $$;
create function public.admin_save_support_template(template bigint, title text, body text, path text default null, keywords text[] default null, sort_order integer default null, is_active boolean default null) returns bigint
 language sql set search_path = '' as $$ select private.admin_save_support_template(template, title, body, path, keywords, sort_order, is_active) $$;
create function public.telegram_handle(update jsonb, site text) returns jsonb language sql set search_path = '' as $$ select private.telegram_handle_at(update, site) $$;
revoke all on function public.admin_support_templates(uuid), public.admin_save_support_template(bigint,text,text,text,text[],integer,boolean), public.telegram_handle(jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_support_templates(uuid), public.admin_save_support_template(bigint,text,text,text,text[],integer,boolean) to authenticated;
grant execute on function public.telegram_handle(jsonb,text) to service_role;
commit;
