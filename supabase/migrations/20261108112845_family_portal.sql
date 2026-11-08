-- Family side of the platform: the nursery daily report, announcements, and a private portal link
-- for each guardian showing their own children only (attendance, daily reports, invoices, pickup
-- list, announcements). Portal links live in a private table that clients cannot read; managers
-- get a guardian's link through a checked function.
-- Forward-only; adds tables and functions and changes no existing data.
begin;

-- 1) Daily report: one per child per day. Every member writes today's report; managers correct
--    other days. Author and time come from the database.
create table public.daily_reports (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 child_id uuid not null,
 report_date date not null,
 mood text check (mood in ('happy','calm','tired','upset','unwell')),
 breakfast text check (breakfast in ('all','some','none')),
 lunch text check (lunch in ('all','some','none')),
 snack text check (snack in ('all','some','none')),
 nap_minutes integer check (nap_minutes between 0 and 600),
 diapers integer check (diapers between 0 and 20),
 activities text check (activities is null or length(activities) <= 500),
 medication text check (medication is null or length(medication) <= 300),
 incident text check (incident is null or length(incident) <= 500),
 notes text check (notes is null or length(notes) <= 1000),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 constraint daily_reports_child_fkey foreign key (child_id,organization_id) references public.children(id,organization_id) on delete cascade,
 constraint daily_reports_one_per_day unique (organization_id,child_id,report_date)
);
create index daily_reports_org_date_idx on public.daily_reports(organization_id,report_date);
alter table public.daily_reports enable row level security;
revoke all on public.daily_reports from public,anon,authenticated;
grant select on public.daily_reports to authenticated;
grant insert(organization_id,child_id,report_date,mood,breakfast,lunch,snack,nap_minutes,diapers,activities,medication,incident,notes) on public.daily_reports to authenticated;
grant update(mood,breakfast,lunch,snack,nap_minutes,diapers,activities,medication,incident,notes) on public.daily_reports to authenticated;
create policy daily_reports_read on public.daily_reports for select to authenticated using(private.is_org_member(organization_id));
create policy daily_reports_insert on public.daily_reports for insert to authenticated with check(private.is_org_member(organization_id));
create policy daily_reports_update on public.daily_reports for update to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id));
create function private.guard_daily_report() returns trigger language plpgsql set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Riyadh')::date;
begin
 if TG_OP = 'UPDATE' and (new.child_id, new.report_date) is distinct from (old.child_id, old.report_date) then
  raise exception 'Report identity cannot change' using errcode = '42501';
 end if;
 if new.report_date > today then raise exception 'Reports cannot be written for a future day' using errcode = '23514'; end if;
 if auth.uid() is not null and new.report_date <> today and not private.can_manage_org(new.organization_id) then
  raise exception 'Only managers correct past reports' using errcode = '42501';
 end if;
 new.updated_by := auth.uid();
 new.updated_at := now();
 return new;
end $$;
revoke all on function private.guard_daily_report() from public,anon,authenticated;
create trigger guard_daily_report before insert or update on public.daily_reports for each row execute function private.guard_daily_report();
create trigger keep_record_tenant before update on public.daily_reports for each row execute function private.keep_record_tenant();
create trigger audit_operation after insert or update on public.daily_reports for each row execute function private.audit_operation();

-- 2) Announcements: managers publish to staff, families or everyone, optionally one class.
create table public.announcements (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 title text not null check (length(btrim(title)) between 1 and 120),
 body text not null check (length(btrim(body)) between 1 and 2000),
 audience text not null default 'all' check (audience in ('all','staff','families')),
 section_id uuid,
 pinned boolean not null default false,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 constraint announcements_section_fkey foreign key (section_id,organization_id) references public.sections(id,organization_id) on delete cascade
);
create index announcements_org_created_idx on public.announcements(organization_id,created_at desc);
alter table public.announcements enable row level security;
revoke all on public.announcements from public,anon,authenticated;
grant select,delete on public.announcements to authenticated;
grant insert(organization_id,title,body,audience,section_id,pinned), update(title,body,audience,section_id,pinned) on public.announcements to authenticated;
create policy announcements_read on public.announcements for select to authenticated using(private.is_org_member(organization_id));
create policy announcements_insert on public.announcements for insert to authenticated with check(private.can_manage_org(organization_id));
create policy announcements_update on public.announcements for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id));
create policy announcements_delete on public.announcements for delete to authenticated using(private.can_manage_org(organization_id));
create function private.stamp_announcement() returns trigger language plpgsql set search_path = '' as $$
begin
 if TG_OP = 'INSERT' then new.created_by := auth.uid(); new.created_at := now();
 else new.created_by := old.created_by; new.created_at := old.created_at; end if;
 return new;
end $$;
revoke all on function private.stamp_announcement() from public,anon,authenticated;
create trigger stamp_announcement before insert or update on public.announcements for each row execute function private.stamp_announcement();
create trigger keep_record_tenant before update on public.announcements for each row execute function private.keep_record_tenant();
create trigger audit_operation after insert or update or delete on public.announcements for each row execute function private.audit_operation();

revoke truncate,references,trigger on public.daily_reports,public.announcements from anon,authenticated;

-- 3) Guardian portal links: kept out of client reach.
create table private.guardian_portals (
 guardian_id uuid primary key references public.guardians(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 token uuid not null unique default gen_random_uuid(),
 created_at timestamptz not null default now()
);
revoke all on private.guardian_portals from public,anon,authenticated,service_role;
alter table private.guardian_portals enable row level security;

-- A manager gets (or, with renew, replaces) a guardian's portal link.
create function private.guardian_portal_token(guardian uuid, renew boolean) returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid; result uuid;
begin
 select g.organization_id into org from public.guardians g where g.id = guardian;
 if org is null or not private.can_manage_org(org) then raise exception 'Guardian not found' using errcode = 'P0002'; end if;
 insert into private.guardian_portals(guardian_id,organization_id) values (guardian,org)
  on conflict (guardian_id) do update set token = case when renew then gen_random_uuid() else private.guardian_portals.token end
  returning token into result;
 return result;
end $$;
revoke all on function private.guardian_portal_token(uuid,boolean) from public,anon,authenticated;
grant execute on function private.guardian_portal_token(uuid,boolean) to authenticated;
create function public.guardian_portal_token(guardian uuid, renew boolean default false) returns uuid language sql set search_path = '' as $$ select private.guardian_portal_token(guardian, renew) $$;
revoke all on function public.guardian_portal_token(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.guardian_portal_token(uuid,boolean) to authenticated;

-- What a guardian sees: only children linked to them, the last 30 days of attendance and 14 daily
-- reports, issued invoices with their share links, active pickup people, and announcements for
-- families (school-wide or their children's classes).
create function private.family_portal(token uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
     'name', c.full_name,
     'section', (select concat_ws(' — ', gl.name, s.name) from public.sections s left join public.grade_levels gl on gl.id = s.grade_level_id where s.id = c.section_id),
     'today', (select a.status from public.attendance a where a.child_id = c.id and a.attendance_date = today),
     'picked_up', (select jsonb_build_object('by',pk.picked_by_name,'at',pk.picked_at) from public.pickups pk where pk.child_id = c.id and pk.pickup_date = today),
     'attendance', (select jsonb_build_object('present',count(*) filter (where a.status='present'),'late',count(*) filter (where a.status='late'),'absent',count(*) filter (where a.status='absent'),'excused',count(*) filter (where a.status='excused'))
        from public.attendance a where a.child_id = c.id and a.attendance_date > today - 30),
     'reports', coalesce((select jsonb_agg(jsonb_build_object('date',r.report_date,'mood',r.mood,'breakfast',r.breakfast,'lunch',r.lunch,'snack',r.snack,'nap_minutes',r.nap_minutes,'diapers',r.diapers,'activities',r.activities,'medication',r.medication,'incident',r.incident,'notes',r.notes) order by r.report_date desc)
        from (select * from public.daily_reports r0 where r0.child_id = c.id order by r0.report_date desc limit 14) r), '[]'),
     'pickup_people', coalesce((select jsonb_agg(jsonb_build_object('name',ap.full_name,'relationship',ap.relationship)) from public.authorized_pickups ap where ap.child_id = c.id and ap.is_active), '[]')
   ) order by c.full_name) from public.children c where c.id = any(kids)), '[]'),
  'invoices', coalesce((select jsonb_agg(jsonb_build_object('number',i.number,'title',i.title,'status',i.status,'due_date',i.due_date,'total',i.amount_sar,'paid',i.paid_total,'token',i.share_token) order by i.issue_date desc nulls last)
     from public.invoices i where i.organization_id = org and i.status in ('issued','paid') and (i.guardian_id = g.id or i.child_id = any(kids))), '[]'),
  'announcements', coalesce((select jsonb_agg(jsonb_build_object('title',n.title,'body',n.body,'pinned',n.pinned,'at',n.created_at) order by n.pinned desc, n.created_at desc)
     from (select * from public.announcements n0 where n0.organization_id = org and n0.audience in ('all','families')
           and (n0.section_id is null or n0.section_id in (select c.section_id from public.children c where c.id = any(kids)))
           order by n0.pinned desc, n0.created_at desc limit 20) n), '[]')
 );
end $$;
revoke all on function private.family_portal(uuid) from public,anon,authenticated;
grant execute on function private.family_portal(uuid) to anon, authenticated;
create function public.family_portal(token uuid) returns jsonb language sql stable set search_path = '' as $$ select private.family_portal(token) $$;
revoke all on function public.family_portal(uuid) from public,anon,authenticated,service_role;
grant execute on function public.family_portal(uuid) to anon, authenticated;
commit;
