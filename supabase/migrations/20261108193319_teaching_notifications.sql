-- Teaching permissions, notifications (in-app and push) and parents' absence notices.
-- 1) A staff member who is assigned to classes (homeroom or timetable) records attendance, daily
--    reports, grades and behaviour only for those classes. Staff with no assignment keep today's
--    access, so nothing breaks before a school sets up its timetable. Managers keep full access.
-- 2) Notifications: each person gets in-app notifications for what concerns them (a task assigned,
--    a reply to their inquiry, a leave decision; for managers: new inquiries, leave requests,
--    applications, online payments and absence notices). Devices that subscribed also get a push
--    notification, sent by the app server when the database calls it through pg_net.
-- 3) Parents report an absence from the family portal; staff see it and record it in one tap.
-- Forward-only.
begin;

-- 1) Teaching permissions --------------------------------------------------------------------------
create function private.teaches_section(org uuid, section uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.can_manage_org(org) or (private.is_org_member(org) and (
   not exists (select 1 from public.sections s where s.organization_id = org and s.homeroom_teacher_id = auth.uid())
     and not exists (select 1 from public.timetable_slots t where t.organization_id = org and t.teacher_id = auth.uid())
   or section in (select s.id from public.sections s where s.organization_id = org and s.homeroom_teacher_id = auth.uid())
   or section in (select t.section_id from public.timetable_slots t where t.organization_id = org and t.teacher_id = auth.uid())))
$$;
create function private.teaches_child(org uuid, child uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.teaches_section(org, (select c.section_id from public.children c where c.id = child and c.organization_id = org))
$$;
revoke all on function private.teaches_section(uuid,uuid), private.teaches_child(uuid,uuid) from public,anon,authenticated;
grant execute on function private.teaches_section(uuid,uuid), private.teaches_child(uuid,uuid) to authenticated;

create policy attendance_teacher_insert on public.attendance as restrictive for insert to authenticated with check(private.teaches_child(organization_id, child_id));
create policy attendance_teacher_update on public.attendance as restrictive for update to authenticated using(private.teaches_child(organization_id, child_id));
create policy daily_reports_teacher_insert on public.daily_reports as restrictive for insert to authenticated with check(private.teaches_child(organization_id, child_id));
create policy daily_reports_teacher_update on public.daily_reports as restrictive for update to authenticated using(private.teaches_child(organization_id, child_id));
create policy behavior_teacher_insert on public.behavior_notes as restrictive for insert to authenticated with check(private.teaches_child(organization_id, child_id));
create policy assessments_teacher_insert on public.assessments as restrictive for insert to authenticated with check(private.teaches_section(organization_id, section_id));
create policy assessments_teacher_update on public.assessments as restrictive for update to authenticated using(private.teaches_section(organization_id, section_id));
create policy grades_teacher_insert on public.grades as restrictive for insert to authenticated
 with check(private.teaches_section(organization_id, (select a.section_id from public.assessments a where a.id = assessment_id)));
create policy grades_teacher_update on public.grades as restrictive for update to authenticated
 using(private.teaches_section(organization_id, (select a.section_id from public.assessments a where a.id = assessment_id)));

-- 2) Notifications ---------------------------------------------------------------------------------
create table public.notifications (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('task','inquiry','inquiry_reply','leave','leave_decision','application','payment','absence_notice','announcement','member')),
 title text not null check (length(title) between 1 and 120),
 body text check (body is null or length(body) <= 300),
 url text check (url is null or url ~ '^/[A-Za-z0-9/_?=&.%-]*$'),
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from public,anon,authenticated;
grant select, delete on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
create policy notifications_own on public.notifications for select to authenticated using(user_id = auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated using(user_id = auth.uid()) with check(user_id = auth.uid());
create policy notifications_own_delete on public.notifications for delete to authenticated using(user_id = auth.uid());

create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
 p256dh text not null check (length(p256dh) between 20 and 200),
 auth text not null check (length(auth) between 8 and 100),
 created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public,anon,authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant insert(endpoint,p256dh,auth) on public.push_subscriptions to authenticated;
create policy push_own_read on public.push_subscriptions for select to authenticated using(user_id = auth.uid());
create policy push_own_insert on public.push_subscriptions for insert to authenticated with check(user_id = auth.uid());
create policy push_own_delete on public.push_subscriptions for delete to authenticated using(user_id = auth.uid());

-- Where to send push requests and the shared secret; set once by the platform team, never readable by clients.
create table private.push_config (id boolean primary key default true check (id), endpoint text not null, secret text not null);
alter table private.push_config enable row level security;
revoke all on private.push_config from public,anon,authenticated;

do $$ begin create extension if not exists pg_net; exception when others then null; end $$;

create function private.notify(org uuid, member uuid, kind text, title text, body text, url text) returns void language plpgsql security definer set search_path = '' as $$
declare cfg private.push_config%rowtype; subs jsonb;
begin
 if member is null or member = auth.uid() then return; end if;
 insert into public.notifications(organization_id,user_id,kind,title,body,url) values (org,member,kind,left(title,120),left(body,300),url);
 select * into cfg from private.push_config limit 1;
 if not found then return; end if;
 select jsonb_agg(jsonb_build_object('endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)) into subs from public.push_subscriptions s where s.user_id = member;
 if subs is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return; end if;
 execute 'select net.http_post($1, $2, ''{}''::jsonb, $3, 5000)'
  using cfg.endpoint, jsonb_build_object('subscriptions',subs,'title',title,'body',body,'url',url),
        jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || cfg.secret);
exception when others then
 -- A failed push must never block the action that caused it; the in-app notification is kept.
 return;
end $$;
create function private.notify_managers(org uuid, kind text, title text, body text, url text) returns void language plpgsql security definer set search_path = '' as $$
declare m record;
begin
 for m in select user_id from public.memberships where organization_id = org and role in ('owner','admin') loop
  perform private.notify(org, m.user_id, kind, title, body, url);
 end loop;
end $$;
revoke all on function private.notify(uuid,uuid,text,text,text,text), private.notify_managers(uuid,text,text,text,text) from public,anon,authenticated;

create function private.on_task_notify() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.assignee_id is not null and (TG_OP = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
  perform private.notify(new.organization_id, new.assignee_id, 'task', 'مهمة جديدة لك: ' || new.title,
   case when new.due_date is not null then 'موعدها ' || to_char(new.due_date,'YYYY-MM-DD') end, '/dashboard/my');
 end if;
 return null;
end $$;
create trigger on_task_notify after insert or update of assignee_id on public.tasks for each row execute function private.on_task_notify();

create function private.on_inquiry_notify() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 perform private.notify_managers(new.organization_id, 'inquiry', 'استفسار جديد: ' || new.subject, left(new.body, 140), '/dashboard/inquiries/' || new.id);
 return null;
end $$;
create trigger on_inquiry_notify after insert on public.inquiries for each row execute function private.on_inquiry_notify();

create function private.on_inquiry_reply_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare q public.inquiries%rowtype;
begin
 select * into q from public.inquiries i where i.id = new.inquiry_id;
 if q.author_id is distinct from new.author_id then
  perform private.notify(new.organization_id, q.author_id, 'inquiry_reply', 'ردّت الإدارة على: ' || q.subject, left(new.body, 140), '/dashboard/inquiries/' || q.id);
 else
  perform private.notify_managers(new.organization_id, 'inquiry', 'رد جديد على: ' || q.subject, left(new.body, 140), '/dashboard/inquiries/' || q.id);
 end if;
 return null;
end $$;
create trigger on_inquiry_reply_notify after insert on public.inquiry_replies for each row execute function private.on_inquiry_reply_notify();

create function private.on_leave_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare who text; member uuid;
begin
 select sp.full_name, sp.user_id into who, member from public.staff_profiles sp where sp.id = new.staff_id;
 if TG_OP = 'INSERT' then
  perform private.notify_managers(new.organization_id, 'leave', 'طلب إجازة من ' || coalesce(who,'موظف'), to_char(new.starts_on,'YYYY-MM-DD') || ' ← ' || to_char(new.ends_on,'YYYY-MM-DD'), '/dashboard/staff');
 elsif new.status is distinct from old.status and new.status in ('approved','rejected') then
  perform private.notify(new.organization_id, member, 'leave_decision', case when new.status = 'approved' then 'اعتُمدت إجازتك ✓' else 'لم تُعتمد إجازتك' end,
   to_char(new.starts_on,'YYYY-MM-DD') || ' ← ' || to_char(new.ends_on,'YYYY-MM-DD'), '/dashboard/my');
 end if;
 return null;
end $$;
create trigger on_leave_notify after insert or update of status on public.leave_requests for each row execute function private.on_leave_notify();

create function private.on_application_notify() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 perform private.notify_managers(new.organization_id, 'application', 'طلب التحاق جديد: ' || new.child_name, 'ولي الأمر ' || new.guardian_name, '/dashboard/admissions');
 return null;
end $$;
create trigger on_application_notify after insert on public.applications for each row execute function private.on_application_notify();

create function private.on_payment_notify() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status = 'paid' and old.status is distinct from 'paid' and new.mode = 'live' then
  perform private.notify_managers(new.organization_id, 'payment', 'دفعة إلكترونية: ' || to_char(new.amount,'FM999G999G990D00') || ' ر.س', null, '/dashboard/finance/online');
 end if;
 return null;
end $$;
create trigger on_payment_notify after update of status on public.payment_intents for each row execute function private.on_payment_notify();

create function private.on_staff_announcement_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare m record;
begin
 if new.audience in ('all','staff') then
  for m in select user_id from public.memberships where organization_id = new.organization_id loop
   perform private.notify(new.organization_id, m.user_id, 'announcement', '📢 ' || new.title, left(new.body, 140), '/dashboard/announcements');
  end loop;
 end if;
 return null;
end $$;
create trigger on_staff_announcement_notify after insert on public.announcements for each row execute function private.on_staff_announcement_notify();

revoke all on function private.on_task_notify(), private.on_inquiry_notify(), private.on_inquiry_reply_notify(), private.on_leave_notify(),
 private.on_application_notify(), private.on_payment_notify(), private.on_staff_announcement_notify() from public,anon,authenticated;

do $$ begin
 if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then alter publication supabase_realtime add table public.notifications; end if;
end $$;

-- 3) Parents' absence notices ----------------------------------------------------------------------
create table public.absence_notices (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 child_id uuid not null,
 guardian_id uuid,
 starts_on date not null,
 ends_on date not null,
 reason text check (reason is null or length(reason) <= 300),
 created_at timestamptz not null default now(),
 handled_by uuid references auth.users(id) on delete set null,
 handled_at timestamptz,
 constraint absence_notices_dates check (ends_on >= starts_on and ends_on - starts_on <= 30),
 constraint absence_notices_child_fkey foreign key (child_id,organization_id) references public.children(id,organization_id) on delete cascade,
 constraint absence_notices_guardian_fkey foreign key (guardian_id,organization_id) references public.guardians(id,organization_id) on delete set null (guardian_id)
);
create index absence_notices_day_idx on public.absence_notices(organization_id, starts_on, ends_on);
alter table public.absence_notices enable row level security;
revoke all on public.absence_notices from public,anon,authenticated;
grant select on public.absence_notices to authenticated;
grant update(handled_by,handled_at) on public.absence_notices to authenticated;
create policy absence_notices_read on public.absence_notices for select to authenticated using(private.is_org_member(organization_id));
create policy absence_notices_handle on public.absence_notices for update to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id));

create function private.submit_absence_notice(token uuid, child uuid, from_day date, to_day date, note text) returns text language plpgsql security definer set search_path = '' as $$
declare g public.guardians%rowtype; kid text; today date := (now() at time zone 'Asia/Riyadh')::date; homeroom uuid;
begin
 select gd.* into g from private.guardian_portals p join public.guardians gd on gd.id = p.guardian_id where p.token = submit_absence_notice.token;
 if not found then raise exception 'Portal not found' using errcode = 'P0002'; end if;
 if not exists (select 1 from public.child_guardians cg where cg.guardian_id = g.id and cg.child_id = child) then raise exception 'Not your child' using errcode = '42501'; end if;
 if from_day is null or to_day is null or from_day < today - 1 or from_day > today + 60 or to_day < from_day or to_day - from_day > 30 then raise exception 'Choose valid dates' using errcode = '22023'; end if;
 if (select count(*) from public.absence_notices n where n.guardian_id = g.id and n.created_at > now() - interval '1 day') >= 10 then raise exception 'Too many notices today' using errcode = '54000'; end if;
 insert into public.absence_notices(organization_id,child_id,guardian_id,starts_on,ends_on,reason) values (g.organization_id,child,g.id,from_day,to_day,left(nullif(btrim(note),''),300));
 select c.full_name, s.homeroom_teacher_id into kid, homeroom from public.children c left join public.sections s on s.id = c.section_id where c.id = child;
 perform private.notify_managers(g.organization_id, 'absence_notice', 'إشعار غياب: ' || kid, to_char(from_day,'YYYY-MM-DD') || coalesce(' — ' || left(nullif(btrim(note),''),100), ''), '/dashboard/attendance');
 if homeroom is not null and not exists (select 1 from public.memberships m where m.organization_id = g.organization_id and m.user_id = homeroom and m.role in ('owner','admin')) then
  perform private.notify(g.organization_id, homeroom, 'absence_notice', 'إشعار غياب: ' || kid, to_char(from_day,'YYYY-MM-DD'), '/dashboard/attendance');
 end if;
 return 'ok';
end $$;
revoke all on function private.submit_absence_notice(uuid,uuid,date,date,text) from public,anon,authenticated;
grant execute on function private.submit_absence_notice(uuid,uuid,date,date,text) to anon, authenticated;
create function public.submit_absence_notice(token uuid, child uuid, from_day date, to_day date, note text default null) returns text language sql set search_path = '' as $$ select private.submit_absence_notice(token, child, from_day, to_day, note) $$;
revoke all on function public.submit_absence_notice(uuid,uuid,date,date,text) from public,anon,authenticated,service_role;
grant execute on function public.submit_absence_notice(uuid,uuid,date,date,text) to anon, authenticated;

-- The portal now carries each child's id (for the absence form) and recent notices.
create or replace function private.family_portal(token uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g public.guardians%rowtype; org uuid; today date := (now() at time zone 'Asia/Riyadh')::date; kids uuid[];
begin
 if token is null then return null; end if;
 select gd.* into g from private.guardian_portals p join public.guardians gd on gd.id = p.guardian_id where p.token = family_portal.token;
 if not found then return null; end if;
 org := g.organization_id;
 select coalesce(array_agg(cg.child_id), '{}') into kids from public.child_guardians cg where cg.guardian_id = g.id and cg.organization_id = org;
 return jsonb_build_object(
  'guardian', g.full_name,
  'organization', (select jsonb_build_object('name',o.name,'type',o.type,'legal_name',p.legal_name,'phone',p.phone,'brand_color',coalesce(p.brand_color,'#3E1657'),'logo_data',p.logo_data)
     from public.organizations o left join public.organization_profiles p on p.organization_id = o.id where o.id = org),
  'children', coalesce((select jsonb_agg(jsonb_build_object(
     'id', c.id,
     'name', c.full_name,
     'notices', coalesce((select jsonb_agg(jsonb_build_object('from',n.starts_on,'to',n.ends_on,'reason',n.reason,'seen',n.handled_at is not null) order by n.starts_on desc)
        from (select * from public.absence_notices n0 where n0.child_id = c.id and n0.ends_on >= today - 7 order by n0.starts_on desc limit 5) n), '[]'),
     'section', (select concat_ws(' — ', gl.name, s.name) from public.sections s left join public.grade_levels gl on gl.id = s.grade_level_id where s.id = c.section_id),
     'today', (select a.status from public.attendance a where a.child_id = c.id and a.attendance_date = today),
     'picked_up', (select jsonb_build_object('by',pk.picked_by_name,'at',pk.picked_at) from public.pickups pk where pk.child_id = c.id and pk.pickup_date = today),
     'attendance', (select jsonb_build_object('present',count(*) filter (where a.status='present'),'late',count(*) filter (where a.status='late'),'absent',count(*) filter (where a.status='absent'),'excused',count(*) filter (where a.status='excused'))
        from public.attendance a where a.child_id = c.id and a.attendance_date > today - 30),
     'reports', coalesce((select jsonb_agg(jsonb_build_object('date',r.report_date,'mood',r.mood,'breakfast',r.breakfast,'lunch',r.lunch,'snack',r.snack,'nap_minutes',r.nap_minutes,'diapers',r.diapers,'activities',r.activities,'medication',r.medication,'incident',r.incident,'notes',r.notes) order by r.report_date desc)
        from (select * from public.daily_reports r0 where r0.child_id = c.id order by r0.report_date desc limit 14) r), '[]'),
     'pickup_people', coalesce((select jsonb_agg(jsonb_build_object('name',ap.full_name,'relationship',ap.relationship)) from public.authorized_pickups ap where ap.child_id = c.id and ap.is_active), '[]'),
     'status', c.status,
     'grades', coalesce((select jsonb_agg(jsonb_build_object('subject',x.subject,'title',x.title,'kind',x.kind,'score',x.score,'max',x.max_score,'absent',x.absent,'date',x.at) order by x.at desc)
        from (select su.name as subject, asm.title, asm.kind, gr.score, asm.max_score, gr.absent, coalesce(asm.due_date, gr.graded_at::date) as at
              from public.grades gr join public.assessments asm on asm.id = gr.assessment_id join public.subjects su on su.id = asm.subject_id
              where gr.child_id = c.id order by coalesce(asm.due_date, gr.graded_at::date) desc limit 20) x), '[]'),
     'behavior', coalesce((select jsonb_agg(jsonb_build_object('kind',b.kind,'category',b.category,'note',b.note,'points',b.points,'at',b.created_at) order by b.created_at desc)
        from (select * from public.behavior_notes b0 where b0.child_id = c.id order by b0.created_at desc limit 10) b), '[]'),
     'bus_stop', (select jsonb_build_object('route',br.name,'stop',rs.stop_name,'pickup_time',rs.pickup_time,'dropoff_time',rs.dropoff_time)
        from public.route_stops rs join public.bus_routes br on br.id = rs.route_id where rs.child_id = c.id limit 1),
     'bus', coalesce((select jsonb_agg(jsonb_build_object('route',br.name,'direction',t.direction,'event',e.event,'at',e.at) order by e.at)
        from public.trip_events e join public.transport_trips t on t.id = e.trip_id join public.bus_routes br on br.id = t.route_id
        where e.child_id = c.id and t.trip_date = today), '[]')
   ) order by c.full_name) from public.children c where c.id = any(kids)), '[]'),
  'invoices', coalesce((select jsonb_agg(jsonb_build_object('number',i.number,'title',i.title,'status',i.status,'due_date',i.due_date,'total',i.amount_sar,'paid',i.paid_total,'token',i.share_token) order by i.issue_date desc nulls last)
     from public.invoices i where i.organization_id = org and i.status in ('issued','paid') and (i.guardian_id = g.id or i.child_id = any(kids))), '[]'),
  'announcements', coalesce((select jsonb_agg(jsonb_build_object('title',n.title,'body',n.body,'pinned',n.pinned,'at',n.created_at) order by n.pinned desc, n.created_at desc)
     from (select * from public.announcements n0 where n0.organization_id = org and n0.audience in ('all','families')
           and (n0.section_id is null or n0.section_id in (select c.section_id from public.children c where c.id = any(kids)))
           order by n0.pinned desc, n0.created_at desc limit 20) n), '[]')
 );
end $$;
commit;
