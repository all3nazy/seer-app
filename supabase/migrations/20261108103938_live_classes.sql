-- Live class view: an append-only history of every attendance change (who, when, from which
-- status to which), and realtime publication so open class screens update as staff record.
-- Rows are written only by the database trigger; members of the organization may read them.
-- Forward-only; adds a table, a trigger and publication entries, and changes no existing data.
begin;
create table public.attendance_events (
 id bigint generated always as identity primary key,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 child_id uuid not null,
 attendance_date date not null,
 from_status text check (from_status in ('present','absent','late','excused')),
 to_status text check (to_status in ('present','absent','late','excused')),
 actor_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 constraint attendance_events_change check (from_status is distinct from to_status),
 constraint attendance_events_child_fkey foreign key (child_id,organization_id)
  references public.children(id,organization_id) on delete cascade
);
create index attendance_events_org_day_idx on public.attendance_events(organization_id,attendance_date,created_at desc);
alter table public.attendance_events enable row level security;
revoke all on public.attendance_events from public,anon,authenticated;
grant select on public.attendance_events to authenticated;
create policy attendance_events_read on public.attendance_events for select to authenticated using(private.is_org_member(organization_id));

create function private.log_attendance_event() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if TG_OP = 'INSERT' then
  insert into public.attendance_events(organization_id,child_id,attendance_date,from_status,to_status,actor_id)
  values (new.organization_id,new.child_id,new.attendance_date,null,new.status,auth.uid());
 elsif TG_OP = 'UPDATE' then
  if new.status is distinct from old.status then
   insert into public.attendance_events(organization_id,child_id,attendance_date,from_status,to_status,actor_id)
   values (new.organization_id,new.child_id,new.attendance_date,old.status,new.status,auth.uid());
  end if;
 elsif exists (select 1 from public.children c where c.id = old.child_id and c.organization_id = old.organization_id) then
  -- A deleted entry is logged only while the child still exists; when the child itself is
  -- removed, its history goes with it.
  insert into public.attendance_events(organization_id,child_id,attendance_date,from_status,to_status,actor_id)
  values (old.organization_id,old.child_id,old.attendance_date,old.status,null,auth.uid());
 end if;
 return null;
end $$;
revoke all on function private.log_attendance_event() from public,anon,authenticated;
create trigger log_attendance_event after insert or update or delete on public.attendance for each row execute function private.log_attendance_event();
revoke truncate,references,trigger on public.attendance_events from anon,authenticated;

-- Realtime delivers row changes only to subscribers whose RLS allows reading the row.
do $$
begin
 if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
  alter publication supabase_realtime add table public.attendance, public.pickups, public.attendance_events;
 end if;
end $$;
commit;
