-- Student files, health records and daily attendance.
-- Forward-only; apply once after review. Every row is tenant-scoped, RLS-protected and audited
-- by identifier only: no names, health details or notes are copied into the audit log.
begin;

-- 1) Richer child and guardian files. Existing table-wide grants and policies already cover
--    these columns: members read them, managers write them.
alter table public.children add column gender text check (gender is null or gender in ('male','female'));
alter table public.children add column national_id text check (national_id is null or national_id ~ '^[0-9]{10}$');
alter table public.children add column branch_id uuid;
alter table public.children add constraint children_branch_id_organization_id_fkey
 foreign key (branch_id,organization_id) references public.branches(id,organization_id) on delete set null (branch_id);
alter table public.children add column notes text check (notes is null or length(notes) <= 1000);
create index children_org_branch_idx on public.children(organization_id,branch_id);

alter table public.guardians add column email text
 check (email is null or (email = lower(btrim(email)) and length(email) between 3 and 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));
alter table public.guardians add column national_id text check (national_id is null or national_id ~ '^[0-9]{10}$');
alter table public.guardians add column workplace text check (workplace is null or length(btrim(workplace)) between 1 and 120);

-- 2) Health record: one per child. Staff need allergies and emergency contacts to care for the
--    child, so every member reads it; only managers write it.
create table public.child_health (
 child_id uuid primary key,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 blood_type text check (blood_type is null or blood_type in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
 allergies text check (allergies is null or length(allergies) <= 500),
 conditions text check (conditions is null or length(conditions) <= 500),
 medications text check (medications is null or length(medications) <= 500),
 emergency_name text check (emergency_name is null or length(btrim(emergency_name)) between 1 and 120),
 emergency_phone text check (emergency_phone is null or emergency_phone ~ '^\+?[0-9]{8,15}$'),
 notes text check (notes is null or length(notes) <= 1000),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 constraint child_health_child_organization_fkey foreign key (child_id,organization_id)
  references public.children(id,organization_id) on delete cascade
);
alter table public.child_health enable row level security;
revoke all on public.child_health from public,anon,authenticated;
grant select,delete on public.child_health to authenticated;
grant insert(child_id,organization_id,blood_type,allergies,conditions,medications,emergency_name,emergency_phone,notes) on public.child_health to authenticated;
grant update(blood_type,allergies,conditions,medications,emergency_name,emergency_phone,notes) on public.child_health to authenticated;
create policy child_health_read on public.child_health for select to authenticated using(private.is_org_member(organization_id));
create policy child_health_insert on public.child_health for insert to authenticated with check(private.can_manage_org(organization_id));
create policy child_health_update on public.child_health for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id));
create policy child_health_delete on public.child_health for delete to authenticated using(private.can_manage_org(organization_id));

create function private.stamp_child_health() returns trigger language plpgsql set search_path = '' as $$
begin
 new.updated_by := auth.uid();
 new.updated_at := now();
 return new;
end $$;
revoke all on function private.stamp_child_health() from public,anon,authenticated;
create trigger stamp_child_health before insert or update on public.child_health for each row execute function private.stamp_child_health();
create trigger keep_record_tenant before update on public.child_health for each row execute function private.keep_record_tenant();

-- Records keyed by child (health has no id of its own) are audited against the child.
create function private.audit_child_record() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if TG_OP = 'DELETE' then
  insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values(old.organization_id,auth.uid(),TG_TABLE_NAME,old.child_id,TG_OP);
  return old;
 end if;
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values(new.organization_id,auth.uid(),TG_TABLE_NAME,new.child_id,TG_OP);
 return new;
end $$;
revoke all on function private.audit_child_record() from public,anon,authenticated;
create trigger audit_child_record after insert or update or delete on public.child_health for each row execute function private.audit_child_record();

-- 3) Daily attendance: one row per child per day. Every member records today's attendance;
--    only managers correct other days or delete entries. The recorder and time come from the
--    database, never from the browser.
create table public.attendance (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 child_id uuid not null,
 attendance_date date not null,
 status text not null check (status in ('present','absent','late','excused')),
 note text check (note is null or length(note) <= 200),
 recorded_by uuid references auth.users(id) on delete set null,
 recorded_at timestamptz not null default now(),
 constraint attendance_child_organization_fkey foreign key (child_id,organization_id)
  references public.children(id,organization_id) on delete cascade,
 constraint attendance_one_per_day unique (organization_id,child_id,attendance_date)
);
create index attendance_org_date_idx on public.attendance(organization_id,attendance_date);
create index attendance_child_date_idx on public.attendance(child_id,attendance_date desc);
alter table public.attendance enable row level security;
revoke all on public.attendance from public,anon,authenticated;
grant select,delete on public.attendance to authenticated;
grant insert(organization_id,child_id,attendance_date,status,note) on public.attendance to authenticated;
grant update(status,note) on public.attendance to authenticated;
create policy attendance_read on public.attendance for select to authenticated using(private.is_org_member(organization_id));
create policy attendance_insert on public.attendance for insert to authenticated with check(private.is_org_member(organization_id));
create policy attendance_update on public.attendance for update to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id));
create policy attendance_delete on public.attendance for delete to authenticated using(private.can_manage_org(organization_id));

create function private.guard_attendance() returns trigger language plpgsql set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Riyadh')::date;
begin
 if TG_OP = 'UPDATE' and (new.child_id, new.attendance_date) is distinct from (old.child_id, old.attendance_date) then
  raise exception 'Attendance identity cannot change' using errcode = '42501';
 end if;
 if new.attendance_date > today then
  raise exception 'Attendance cannot be recorded for a future day' using errcode = '23514';
 end if;
 if auth.uid() is not null and new.attendance_date <> today and not private.can_manage_org(new.organization_id) then
  raise exception 'Only managers correct past attendance' using errcode = '42501';
 end if;
 new.recorded_by := auth.uid();
 new.recorded_at := now();
 return new;
end $$;
revoke all on function private.guard_attendance() from public,anon,authenticated;
create trigger guard_attendance before insert or update on public.attendance for each row execute function private.guard_attendance();
create trigger keep_record_tenant before update on public.attendance for each row execute function private.keep_record_tenant();
create trigger audit_operation after insert or update or delete on public.attendance for each row execute function private.audit_operation();

revoke truncate,references,trigger on public.child_health,public.attendance from anon,authenticated;
commit;
