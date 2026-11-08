-- Student pickup (dismissal): who may collect each child, and a log of every hand-over.
-- Forward-only; apply once after review. Staff record hand-overs; managers maintain the list of
-- authorized people. A hand-over must name a linked guardian or an active authorized person.
begin;
create table public.authorized_pickups (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 child_id uuid not null,
 full_name text not null check (length(btrim(full_name)) between 1 and 120),
 relationship text not null check (length(btrim(relationship)) between 1 and 40),
 phone text check (phone is null or phone ~ '^\+?[0-9]{8,15}$'),
 national_id text check (national_id is null or national_id ~ '^[0-9]{10}$'),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 constraint authorized_pickups_id_organization_id_key unique (id,organization_id),
 constraint authorized_pickups_child_fkey foreign key (child_id,organization_id) references public.children(id,organization_id) on delete cascade
);
create index authorized_pickups_child_idx on public.authorized_pickups(child_id);

create table public.pickups (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 child_id uuid not null,
 pickup_date date not null,
 guardian_id uuid,
 authorized_id uuid,
 picked_by_name text not null default '',
 handed_by uuid references auth.users(id) on delete set null,
 picked_at timestamptz not null default now(),
 note text check (note is null or length(note) <= 200),
 constraint pickups_one_person check ((guardian_id is null) <> (authorized_id is null)),
 constraint pickups_once_per_day unique (organization_id,child_id,pickup_date),
 constraint pickups_child_fkey foreign key (child_id,organization_id) references public.children(id,organization_id) on delete cascade,
 constraint pickups_guardian_fkey foreign key (guardian_id,organization_id) references public.guardians(id,organization_id) on delete set null (guardian_id),
 constraint pickups_authorized_fkey foreign key (authorized_id,organization_id) references public.authorized_pickups(id,organization_id) on delete set null (authorized_id)
);
create index pickups_org_date_idx on public.pickups(organization_id,pickup_date);

alter table public.authorized_pickups enable row level security;
alter table public.pickups enable row level security;
revoke all on public.authorized_pickups,public.pickups from public,anon,authenticated;
grant select,delete on public.authorized_pickups to authenticated;
grant insert(organization_id,child_id,full_name,relationship,phone,national_id,is_active), update(full_name,relationship,phone,national_id,is_active) on public.authorized_pickups to authenticated;
create policy authorized_pickups_read on public.authorized_pickups for select to authenticated using(private.is_org_member(organization_id));
create policy authorized_pickups_insert on public.authorized_pickups for insert to authenticated with check(private.can_manage_org(organization_id));
create policy authorized_pickups_update on public.authorized_pickups for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id));
create policy authorized_pickups_delete on public.authorized_pickups for delete to authenticated using(private.can_manage_org(organization_id));

grant select,delete on public.pickups to authenticated;
grant insert(organization_id,child_id,guardian_id,authorized_id,note) on public.pickups to authenticated;
create policy pickups_read on public.pickups for select to authenticated using(private.is_org_member(organization_id));
create policy pickups_insert on public.pickups for insert to authenticated with check(private.is_org_member(organization_id));
-- Mistakes are undone by the person who recorded them within 15 minutes, or by a manager.
create policy pickups_delete on public.pickups for delete to authenticated
 using(private.can_manage_org(organization_id) or (handed_by = (select auth.uid()) and picked_at > now() - interval '15 minutes'));

-- The hand-over date, time and staff member come from the database; the person must be allowed.
create function private.guard_pickup() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 new.pickup_date := (now() at time zone 'Asia/Riyadh')::date;
 new.picked_at := now();
 new.handed_by := auth.uid();
 if new.guardian_id is not null then
  if not exists(select 1 from public.child_guardians cg where cg.child_id = new.child_id and cg.guardian_id = new.guardian_id and cg.organization_id = new.organization_id) then
   raise exception 'This guardian is not linked to the child' using errcode = '42501';
  end if;
  select g.full_name into new.picked_by_name from public.guardians g where g.id = new.guardian_id;
 else
  select a.full_name into new.picked_by_name from public.authorized_pickups a
   where a.id = new.authorized_id and a.child_id = new.child_id and a.organization_id = new.organization_id and a.is_active;
  if not found then raise exception 'This person is not authorized for the child' using errcode = '42501'; end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_pickup() from public,anon,authenticated;
create trigger guard_pickup before insert on public.pickups for each row execute function private.guard_pickup();
create trigger keep_record_tenant before update on public.authorized_pickups for each row execute function private.keep_record_tenant();
create trigger audit_operation after insert or update or delete on public.authorized_pickups for each row execute function private.audit_operation();
create trigger audit_operation after insert or delete on public.pickups for each row execute function private.audit_operation();
revoke truncate,references,trigger on public.authorized_pickups,public.pickups from anon,authenticated;
commit;
