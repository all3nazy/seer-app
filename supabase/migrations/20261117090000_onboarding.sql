-- Guided setup (mandatory onboarding).
-- 1) public.onboarding_progress: one row per member and organization: the steps the member marked
--    (only those that cannot be measured), snoozed until, number of snoozes, started and completed.
--    RLS: a member reads their own row, a platform admin reads all; writes only through functions.
-- 2) private.onboarding_steps(org, member): the steps of the member's track, in order, each done or
--    not, measured from the real data where possible. Owners and admins get the organization track
--    (name and phone, device, sections and brand, classes, students, guardians, team, first
--    attendance, first daily report, portal links); staff get a short tour (name and phone, device,
--    attendance, daily report, my tasks, support). Steps of sections that are off are left out.
-- 3) onboarding_status / onboarding_start / onboarding_mark / onboarding_snooze for the member;
--    the third snooze of an incomplete organization setup alerts the platform admins (Telegram too).
-- 4) admin_onboarding(): setup progress of every organization (owner's track) for the admin console,
--    and the Telegram daily summary lists organizations that are stuck.
-- Forward-only.
begin;

-- Notifications for the platform admins about a stuck setup.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('task','inquiry','inquiry_reply','leave','leave_decision','application','payment','absence_notice','announcement','member','subscription','signup','support','onboarding'));

-- 1) Progress -----------------------------------------------------------------------------------
create table public.onboarding_progress (
 organization_id uuid not null,
 user_id uuid not null,
 track text not null check (track in ('org','staff')),
 marked text[] not null default '{}' check (array_position(marked, null) is null and cardinality(marked) <= 20),
 started_at timestamptz,
 snoozed_until timestamptz,
 snooze_count integer not null default 0 check (snooze_count >= 0),
 stuck_alerted_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (organization_id, user_id),
 constraint onboarding_progress_member_fkey foreign key (organization_id, user_id) references public.memberships(organization_id, user_id) on delete cascade
);
create index onboarding_progress_user_idx on public.onboarding_progress(user_id);
alter table public.onboarding_progress enable row level security;
revoke all on public.onboarding_progress from public, anon, authenticated;
grant select on public.onboarding_progress to authenticated;
create policy onboarding_progress_read on public.onboarding_progress for select to authenticated
 using (user_id = (select auth.uid()) or (select private.is_platform_admin()));

-- Members who were already using the platform: staff skip the tour; owners and admins keep the
-- organization track (steps already done count as done).
insert into public.onboarding_progress(organization_id, user_id, track, started_at, completed_at)
select m.organization_id, m.user_id, 'staff', now(), now() from public.memberships m where m.role = 'staff' and m.joined_at < now() - interval '3 days'
on conflict do nothing;

-- 2) Steps ----------------------------------------------------------------------------------------
create function private.onboarding_track(org uuid, member uuid) returns text language sql stable security definer set search_path = '' as $$
 select case when m.role in ('owner','admin') then 'org' else 'staff' end from public.memberships m where m.organization_id = org and m.user_id = member
$$;

-- Steps that cannot be measured from data are marked by the member: the device (installing the app
-- is not visible to the server, only enabled notifications are), sections and brand, and the tour
-- pages of the staff track.
create function private.onboarding_markable(track text, step text) returns boolean language sql immutable set search_path = '' as $$
 select case track when 'org' then step in ('device','sections') else step in ('device','attendance','daily','my','support') end
$$;

create function private.onboarding_steps(org uuid, member uuid) returns table(step text, done boolean, markable boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
 track text := private.onboarding_track(org, member);
 marked text[] := coalesce((select p.marked from public.onboarding_progress p where p.organization_id = org and p.user_id = member), '{}');
 profile boolean; device boolean;
begin
 if track is null then return; end if;
 profile := exists (select 1 from public.memberships m where m.organization_id = org and m.user_id = member and length(btrim(coalesce(m.display_name, ''))) > 0)
  and exists (select 1 from public.member_phones p where p.organization_id = org and p.user_id = member);
 device := 'device' = any(marked) or exists (select 1 from public.push_subscriptions s where s.user_id = member);
 step := 'profile'; done := profile; markable := false; return next;
 step := 'device'; done := device; markable := true; return next;
 if track = 'org' then
  step := 'sections'; done := 'sections' = any(marked); markable := true; return next;
  step := 'classes'; done := exists (select 1 from public.sections s where s.organization_id = org); markable := false; return next;
  step := 'students'; done := exists (select 1 from public.children c where c.organization_id = org); return next;
  step := 'guardians'; done := exists (select 1 from public.child_guardians g where g.organization_id = org); return next;
  step := 'team'; done := exists (select 1 from public.memberships m where m.organization_id = org and m.user_id <> member)
   or exists (select 1 from private.join_links j where j.organization_id = org)
   or exists (select 1 from private.member_invitations i where i.organization_id = org); return next;
  step := 'attendance'; done := exists (select 1 from public.attendance a where a.organization_id = org); return next;
  if private.org_has_feature(org, 'daily') then
   step := 'daily'; done := exists (select 1 from public.daily_reports d where d.organization_id = org); return next;
  end if;
  step := 'portal'; done := exists (select 1 from private.guardian_portals g where g.organization_id = org); return next;
 else
  step := 'attendance'; done := 'attendance' = any(marked) or exists (select 1 from public.attendance a where a.organization_id = org and a.recorded_by = member); markable := true; return next;
  if private.org_has_feature(org, 'daily') then
   step := 'daily'; done := 'daily' = any(marked) or exists (select 1 from public.daily_reports d where d.organization_id = org and d.updated_by = member); return next;
  end if;
  step := 'my'; done := 'my' = any(marked); return next;
  step := 'support'; done := 'support' = any(marked); return next;
 end if;
end $$;

-- 3) For the member ---------------------------------------------------------------------------------
-- {track, steps:[{step, done, markable}], done, total, complete, started, snoozed_until, snooze_count, show_welcome}
-- Creates the member's row on first call and records completion once every step is done.
create function private.onboarding_status(org uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); track text; p public.onboarding_progress%rowtype; steps jsonb; total integer; finished integer;
begin
 track := private.onboarding_track(org, me);
 if me is null or track is null then raise exception 'Not a member' using errcode = '42501'; end if;
 insert into public.onboarding_progress(organization_id, user_id, track) values (org, me, track) on conflict (organization_id, user_id) do nothing;
 select * into p from public.onboarding_progress x where x.organization_id = org and x.user_id = me;
 -- A member promoted to admin (or moved to staff) follows the track of the new role.
 if p.track <> track and p.completed_at is null then
  update public.onboarding_progress x set track = onboarding_status.track, updated_at = now() where x.organization_id = org and x.user_id = me returning * into p;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('step', s.step, 'done', s.done, 'markable', s.markable)), '[]'::jsonb), count(*), count(*) filter (where s.done)
 into steps, total, finished from private.onboarding_steps(org, me) s;
 if p.completed_at is null and total > 0 and finished = total then
  update public.onboarding_progress x set completed_at = now(), updated_at = now() where x.organization_id = org and x.user_id = me returning * into p;
 end if;
 return jsonb_build_object('track', p.track, 'steps', steps, 'done', finished, 'total', total, 'complete', p.completed_at is not null,
  'started', p.started_at is not null, 'snoozed_until', p.snoozed_until, 'snooze_count', p.snooze_count,
  'show_welcome', p.completed_at is null and (p.snoozed_until is null or p.snoozed_until <= now()) and p.started_at is null);
end $$;

-- «ابدأ»: the welcome screen is not shown again; the progress bar stays until the end.
create function private.onboarding_start(org uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 perform private.onboarding_status(org);
 update public.onboarding_progress p set started_at = coalesce(p.started_at, now()), snoozed_until = null, updated_at = now()
 where p.organization_id = org and p.user_id = auth.uid();
 return private.onboarding_status(org);
end $$;

-- A step that cannot be measured, marked done by the member.
create function private.onboarding_mark(org uuid, step text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare track text;
begin
 perform private.onboarding_status(org);
 track := (select p.track from public.onboarding_progress p where p.organization_id = org and p.user_id = auth.uid());
 if not private.onboarding_markable(track, step) then raise exception 'This step is done from the data' using errcode = '22023'; end if;
 update public.onboarding_progress p set marked = case when step = any(p.marked) then p.marked else p.marked || step end, updated_at = now()
 where p.organization_id = org and p.user_id = auth.uid();
 return private.onboarding_status(org);
end $$;

-- «ذكّرني بعدين»: hides the welcome screen for 12 hours (the bar stays). The third snooze of an
-- incomplete organization setup alerts the platform admins once.
create function private.onboarding_snooze(org uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.onboarding_progress%rowtype; status jsonb; org_name text;
begin
 status := private.onboarding_status(org);
 if (status ->> 'complete')::boolean then return status; end if;
 update public.onboarding_progress x set snoozed_until = now() + interval '12 hours', snooze_count = x.snooze_count + 1, updated_at = now()
 where x.organization_id = org and x.user_id = auth.uid() returning * into p;
 if p.track = 'org' and p.snooze_count >= 3 and p.stuck_alerted_at is null then
  select o.name into org_name from public.organizations o where o.id = org;
  perform private.notify_platform_admins(org, 'onboarding', 'منشأة متعثرة في التأسيس: ' || coalesce(org_name, 'منشأة'),
   'أجّلت التجهيز ' || p.snooze_count || ' مرات، وأنجزت ' || (status ->> 'done') || ' من ' || (status ->> 'total') || ' خطوات.', '/admin/subscribers/' || org);
  update public.onboarding_progress x set stuck_alerted_at = now() where x.organization_id = org and x.user_id = auth.uid();
 end if;
 return private.onboarding_status(org);
end $$;

-- 4) For the platform admins ---------------------------------------------------------------------------
-- One row per organization, from the first owner's track: steps done, total, missing steps, snoozes,
-- and «stuck» (snoozed 3 times, or not done 7 days after joining).
create function private.admin_onboarding() returns table(organization_id uuid, done integer, total integer, missing text[], snooze_count integer, stuck boolean, completed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 return query
 with owners as (
  select distinct on (m.organization_id) m.organization_id, m.user_id, m.joined_at from public.memberships m where m.role = 'owner' order by m.organization_id, m.joined_at
 )
 select o.organization_id, s.done::integer, s.total::integer, s.missing, coalesce(p.snooze_count, 0),
  p.completed_at is null and s.done < s.total and (coalesce(p.snooze_count, 0) >= 3 or o.joined_at < now() - interval '7 days'), p.completed_at
 from owners o
 left join public.onboarding_progress p on p.organization_id = o.organization_id and p.user_id = o.user_id
 cross join lateral (select count(*) filter (where x.done) as done, count(*) as total, coalesce(array_agg(x.step) filter (where not x.done), '{}') as missing
  from private.onboarding_steps(o.organization_id, o.user_id) x) s;
end $$;

create or replace function private.telegram_daily() returns integer language plpgsql security definer set search_path = '' as $$
declare ending text; stuck text;
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
 -- Organizations stuck in setup (the admin check is skipped: this runs from the scheduler).
 with owners as (
  select distinct on (m.organization_id) m.organization_id, m.user_id, m.joined_at from public.memberships m where m.role = 'owner' order by m.organization_id, m.joined_at
 ), rows as (
  select o.organization_id, s.done, s.total, coalesce(p.snooze_count, 0) as snoozes
  from owners o left join public.onboarding_progress p on p.organization_id = o.organization_id and p.user_id = o.user_id
  cross join lateral (select count(*) filter (where x.done) as done, count(*) as total from private.onboarding_steps(o.organization_id, o.user_id) x) s
  where p.completed_at is null and s.done < s.total and (coalesce(p.snooze_count, 0) >= 3 or o.joined_at < now() - interval '7 days')
 )
 select string_agg('• ' || g.name || ' — ' || r.done || ' من ' || r.total || case when r.snoozes > 0 then ' (أجّلت ' || r.snoozes || ' مرات)' else '' end, chr(10) order by r.done, g.name)
 into stuck from rows r join public.organizations g on g.id = r.organization_id;
 if stuck is not null then
  perform private.telegram_queue('🧭 منشآت متعثرة في التأسيس:' || chr(10) || stuck, jsonb_build_array(jsonb_build_object('text', 'المشتركين', 'url', '/admin/subscribers')));
 end if;
 return 1;
end $$;

-- Reply templates for questions about the guide.
insert into private.support_templates(title, body, path, keywords, sort_order) values
 ('تشغيل الشرح', 'تقدر تشغّل الشرح من المساعد داخل المنصة 👌' || chr(10) || '• افتح المساعد واكتب «ابدأ الشرح» أو «وش الخطوة الجاية»، واضغط «شغّل الشرح».' || chr(10) || '• أو اضغط «كمّل» في شريط التجهيز أعلى الصفحة.' || chr(10) || '• أو من «الإعدادات» ← «المساعدة» ← «شغّل الشرح».' || chr(10) || 'يوديك لكل خطوة ويأشّر لك على الزر، وإذا خلصتوا يعيده من البداية بدون ما يتغيّر شي.',
  '/dashboard/settings#help', array['شرح','الشرح','جوله','كيف ابدا','من وين ابدا','التجهيز','تجهيز','الخطوه الجايه','علمني'], 150),
 ('شرح صفحة معيّنة', 'لأي صفحة رئيسية في القائمة: افتحها، وافتح المساعد واكتب «اشرح لي هالصفحة»، واضغط «شغّل شرح الصفحة».' || chr(10) || 'يأشّر لك على الأزرار الأساسية فيها واحد واحد مع شرح قصير.',
  '/dashboard/assistant', array['اشرح الصفحه','هالصفحه','وش هالصفحه','ما فهمت الصفحه','وش فايده الصفحه'], 160);

revoke all on function private.onboarding_track(uuid,uuid), private.onboarding_markable(text,text), private.onboarding_steps(uuid,uuid),
 private.onboarding_status(uuid), private.onboarding_start(uuid), private.onboarding_mark(uuid,text), private.onboarding_snooze(uuid), private.admin_onboarding()
 from public, anon, authenticated;
grant execute on function private.onboarding_status(uuid), private.onboarding_start(uuid), private.onboarding_mark(uuid,text), private.onboarding_snooze(uuid), private.admin_onboarding() to authenticated;

create function public.onboarding_status(org uuid) returns jsonb language sql set search_path = '' as $$ select private.onboarding_status(org) $$;
create function public.onboarding_start(org uuid) returns jsonb language sql set search_path = '' as $$ select private.onboarding_start(org) $$;
create function public.onboarding_mark(org uuid, step text) returns jsonb language sql set search_path = '' as $$ select private.onboarding_mark(org, step) $$;
create function public.onboarding_snooze(org uuid) returns jsonb language sql set search_path = '' as $$ select private.onboarding_snooze(org) $$;
create function public.admin_onboarding() returns table(organization_id uuid, done integer, total integer, missing text[], snooze_count integer, stuck boolean, completed_at timestamptz)
 language sql stable set search_path = '' as $$ select * from private.admin_onboarding() $$;
revoke all on function public.onboarding_status(uuid), public.onboarding_start(uuid), public.onboarding_mark(uuid,text), public.onboarding_snooze(uuid), public.admin_onboarding()
 from public, anon, authenticated, service_role;
grant execute on function public.onboarding_status(uuid), public.onboarding_start(uuid), public.onboarding_mark(uuid,text), public.onboarding_snooze(uuid), public.admin_onboarding() to authenticated;
commit;
