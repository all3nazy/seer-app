-- Transport: vehicles with drivers, bus routes with each student's stop and times, and daily trips
-- where the driver or supervisor marks who boarded and who was dropped off. Families see today's
-- bus events in their portal. Managers set up vehicles, routes and stops; any member runs trips.
-- Forward-only; adds tables and replaces the family portal function to include bus events.
begin;

create table public.vehicles (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 60),
 plate text check (plate is null or length(btrim(plate)) between 1 and 20),
 capacity integer not null default 14 check (capacity between 1 and 80),
 driver_staff_id uuid,
 is_active boolean not null default true,
 constraint vehicles_id_organization_id_key unique (id,organization_id),
 constraint vehicles_driver_fkey foreign key (driver_staff_id,organization_id) references public.staff_profiles(id,organization_id) on delete set null (driver_staff_id)
);
create table public.bus_routes (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 60),
 vehicle_id uuid,
 supervisor_staff_id uuid,
 notes text check (notes is null or length(notes) <= 500),
 constraint bus_routes_id_organization_id_key unique (id,organization_id),
 constraint bus_routes_unique_name unique (organization_id,name),
 constraint bus_routes_vehicle_fkey foreign key (vehicle_id,organization_id) references public.vehicles(id,organization_id) on delete set null (vehicle_id),
 constraint bus_routes_supervisor_fkey foreign key (supervisor_staff_id,organization_id) references public.staff_profiles(id,organization_id) on delete set null (supervisor_staff_id)
);
create table public.route_stops (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 route_id uuid not null,
 child_id uuid not null,
 stop_name text check (stop_name is null or length(btrim(stop_name)) between 1 and 120),
 stop_order integer not null default 0 check (stop_order between 0 and 500),
 pickup_time time,
 dropoff_time time,
 constraint route_stops_one_route unique (organization_id,child_id),
 constraint route_stops_route_fkey foreign key (route_id,organization_id) references public.bus_routes(id,organization_id) on delete cascade,
 constraint route_stops_child_fkey foreign key (child_id,organization_id) references public.children(id,organization_id) on delete cascade
);
create index route_stops_route_idx on public.route_stops(route_id,stop_order);
create table public.transport_trips (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 route_id uuid not null,
 trip_date date not null,
 direction text not null check (direction in ('to_school','to_home')),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 started_by uuid references auth.users(id) on delete set null,
 constraint transport_trips_id_organization_id_key unique (id,organization_id),
 constraint transport_trips_once unique (route_id,trip_date,direction),
 constraint transport_trips_route_fkey foreign key (route_id,organization_id) references public.bus_routes(id,organization_id) on delete cascade
);
create table public.trip_events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 trip_id uuid not null,
 child_id uuid not null,
 event text not null check (event in ('boarded','dropped','absent')),
 at timestamptz not null default now(),
 recorded_by uuid references auth.users(id) on delete set null,
 constraint trip_events_once unique (trip_id,child_id,event),
 constraint trip_events_trip_fkey foreign key (trip_id,organization_id) references public.transport_trips(id,organization_id) on delete cascade,
 constraint trip_events_child_fkey foreign key (child_id,organization_id) references public.children(id,organization_id) on delete cascade
);
create index trip_events_child_idx on public.trip_events(child_id,at desc);

-- Trips run today only; times and recorder come from the database; a finished trip is closed.
create function private.guard_trip() returns trigger language plpgsql set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Riyadh')::date;
begin
 if TG_OP = 'INSERT' then
  if new.trip_date <> today then raise exception 'Trips run today only' using errcode = '23514'; end if;
  new.started_at := now(); new.finished_at := null; new.started_by := auth.uid();
 else
  if (new.route_id, new.trip_date, new.direction, new.started_at) is distinct from (old.route_id, old.trip_date, old.direction, old.started_at) then raise exception 'Trip identity cannot change' using errcode = '42501'; end if;
  new.started_by := old.started_by;
  if old.finished_at is not null then raise exception 'Trip already finished' using errcode = '23514'; end if;
  if new.finished_at is not null then new.finished_at := now(); end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_trip() from public,anon,authenticated;
create trigger guard_trip before insert or update on public.transport_trips for each row execute function private.guard_trip();
create function private.guard_trip_event() returns trigger language plpgsql security definer set search_path = '' as $$
declare trip public.transport_trips%rowtype;
begin
 select * into trip from public.transport_trips t where t.id = new.trip_id;
 if trip.finished_at is not null and auth.uid() is not null then raise exception 'Trip already finished' using errcode = '23514'; end if;
 if not exists(select 1 from public.route_stops s where s.route_id = trip.route_id and s.child_id = new.child_id) then
  raise exception 'Student is not on this route' using errcode = '23514';
 end if;
 new.at := now(); new.recorded_by := auth.uid();
 return new;
end $$;
revoke all on function private.guard_trip_event() from public,anon,authenticated;
create trigger guard_trip_event before insert on public.trip_events for each row execute function private.guard_trip_event();

do $$
declare t text;
begin
 foreach t in array array['vehicles','bus_routes','route_stops','transport_trips','trip_events'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from public,anon,authenticated', t);
  execute format('grant select,delete on public.%I to authenticated', t);
  execute format('create policy %I on public.%I for select to authenticated using(private.is_org_member(organization_id))', t || '_read', t);
  execute format('create trigger audit_operation after insert or update or delete on public.%I for each row execute function private.audit_operation()', t);
  execute format('revoke truncate,references,trigger on public.%I from anon,authenticated', t);
 end loop;
 foreach t in array array['vehicles','bus_routes','route_stops','transport_trips'] loop
  execute format('create trigger keep_record_tenant before update on public.%I for each row execute function private.keep_record_tenant()', t);
 end loop;
 foreach t in array array['vehicles','bus_routes','route_stops'] loop
  execute format('create policy %I on public.%I for insert to authenticated with check(private.can_manage_org(organization_id))', t || '_insert', t);
  execute format('create policy %I on public.%I for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id))', t || '_update', t);
  execute format('create policy %I on public.%I for delete to authenticated using(private.can_manage_org(organization_id))', t || '_delete', t);
 end loop;
end $$;
create policy transport_trips_insert on public.transport_trips for insert to authenticated with check(private.is_org_member(organization_id));
create policy transport_trips_update on public.transport_trips for update to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id));
create policy transport_trips_delete on public.transport_trips for delete to authenticated using(private.can_manage_org(organization_id));
create policy trip_events_insert on public.trip_events for insert to authenticated with check(private.is_org_member(organization_id));
create policy trip_events_delete on public.trip_events for delete to authenticated using(private.is_org_member(organization_id) and recorded_by = auth.uid() and at > now() - interval '15 minutes' or private.can_manage_org(organization_id));
grant insert(organization_id,name,plate,capacity,driver_staff_id,is_active), update(name,plate,capacity,driver_staff_id,is_active) on public.vehicles to authenticated;
grant insert(organization_id,name,vehicle_id,supervisor_staff_id,notes), update(name,vehicle_id,supervisor_staff_id,notes) on public.bus_routes to authenticated;
grant insert(organization_id,route_id,child_id,stop_name,stop_order,pickup_time,dropoff_time), update(route_id,stop_name,stop_order,pickup_time,dropoff_time) on public.route_stops to authenticated;
grant insert(organization_id,route_id,trip_date,direction), update(finished_at) on public.transport_trips to authenticated;
grant insert(organization_id,trip_id,child_id,event) on public.trip_events to authenticated;

-- Families see today's bus events for their children.
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
     'name', c.full_name,
     'section', (select concat_ws(' — ', gl.name, s.name) from public.sections s left join public.grade_levels gl on gl.id = s.grade_level_id where s.id = c.section_id),
     'today', (select a.status from public.attendance a where a.child_id = c.id and a.attendance_date = today),
     'picked_up', (select jsonb_build_object('by',pk.picked_by_name,'at',pk.picked_at) from public.pickups pk where pk.child_id = c.id and pk.pickup_date = today),
     'attendance', (select jsonb_build_object('present',count(*) filter (where a.status='present'),'late',count(*) filter (where a.status='late'),'absent',count(*) filter (where a.status='absent'),'excused',count(*) filter (where a.status='excused'))
        from public.attendance a where a.child_id = c.id and a.attendance_date > today - 30),
     'reports', coalesce((select jsonb_agg(jsonb_build_object('date',r.report_date,'mood',r.mood,'breakfast',r.breakfast,'lunch',r.lunch,'snack',r.snack,'nap_minutes',r.nap_minutes,'diapers',r.diapers,'activities',r.activities,'medication',r.medication,'incident',r.incident,'notes',r.notes) order by r.report_date desc)
        from (select * from public.daily_reports r0 where r0.child_id = c.id order by r0.report_date desc limit 14) r), '[]'),
     'pickup_people', coalesce((select jsonb_agg(jsonb_build_object('name',ap.full_name,'relationship',ap.relationship)) from public.authorized_pickups ap where ap.child_id = c.id and ap.is_active), '[]'),
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
