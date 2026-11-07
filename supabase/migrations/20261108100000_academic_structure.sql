-- Academic structure: years, terms, holidays, grade levels and sections (classes), with students
-- and staff assigned to sections. Also records a guardian's photo consent on the child's file.
-- Forward-only; apply once after review. Members read; managers write; every write is audited.
begin;

create table public.academic_years (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 60),
 starts_on date not null,
 ends_on date not null,
 is_current boolean not null default false,
 constraint academic_years_dates check (ends_on > starts_on),
 constraint academic_years_id_organization_id_key unique (id,organization_id)
);
-- At most one current year per organization.
create unique index academic_years_one_current_idx on public.academic_years(organization_id) where is_current;

create table public.academic_terms (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 academic_year_id uuid not null,
 name text not null check (length(btrim(name)) between 1 and 60),
 starts_on date not null,
 ends_on date not null,
 constraint academic_terms_dates check (ends_on > starts_on),
 constraint academic_terms_year_fkey foreign key (academic_year_id,organization_id) references public.academic_years(id,organization_id) on delete cascade
);
create index academic_terms_year_idx on public.academic_terms(academic_year_id,starts_on);

create table public.holidays (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 80),
 starts_on date not null,
 ends_on date not null,
 constraint holidays_dates check (ends_on >= starts_on)
);
create index holidays_org_dates_idx on public.holidays(organization_id,starts_on);

create table public.grade_levels (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 60),
 stage text not null check (stage in ('nursery','kindergarten','primary','intermediate','secondary')),
 sort_order integer not null default 0 check (sort_order between 0 and 1000),
 constraint grade_levels_id_organization_id_key unique (id,organization_id),
 constraint grade_levels_unique_name unique (organization_id,name)
);

create table public.sections (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 grade_level_id uuid not null,
 branch_id uuid,
 name text not null check (length(btrim(name)) between 1 and 60),
 gender text not null default 'mixed' check (gender in ('boys','girls','mixed')),
 capacity integer check (capacity is null or capacity between 1 and 200),
 homeroom_teacher_id uuid,
 constraint sections_id_organization_id_key unique (id,organization_id),
 constraint sections_unique_name unique (organization_id,grade_level_id,name),
 constraint sections_grade_fkey foreign key (grade_level_id,organization_id) references public.grade_levels(id,organization_id) on delete restrict,
 constraint sections_branch_fkey foreign key (branch_id,organization_id) references public.branches(id,organization_id) on delete set null (branch_id),
 constraint sections_homeroom_fkey foreign key (organization_id,homeroom_teacher_id) references public.memberships(organization_id,user_id) on delete set null (homeroom_teacher_id)
);
create index sections_org_grade_idx on public.sections(organization_id,grade_level_id);

-- Additional staff on a section (subject teachers, assistants).
create table public.section_staff (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 section_id uuid not null,
 user_id uuid not null,
 duty text check (duty is null or length(btrim(duty)) between 1 and 60),
 constraint section_staff_unique unique (section_id,user_id),
 constraint section_staff_section_fkey foreign key (section_id,organization_id) references public.sections(id,organization_id) on delete cascade,
 constraint section_staff_member_fkey foreign key (organization_id,user_id) references public.memberships(organization_id,user_id) on delete cascade
);
create index section_staff_user_idx on public.section_staff(organization_id,user_id);

-- A child's current section, and the guardian's consent to photographs.
alter table public.children add column section_id uuid;
alter table public.children add constraint children_section_fkey foreign key (section_id,organization_id)
 references public.sections(id,organization_id) on delete set null (section_id);
create index children_org_section_idx on public.children(organization_id,section_id);
alter table public.children add column photo_consent boolean not null default false;
alter table public.children add column photo_consent_at timestamptz;
create function private.stamp_photo_consent() returns trigger language plpgsql set search_path = '' as $$
begin
 if TG_OP = 'INSERT' or new.photo_consent is distinct from old.photo_consent then
  new.photo_consent_at := case when new.photo_consent then now() end;
 else
  new.photo_consent_at := old.photo_consent_at;
 end if;
 return new;
end $$;
revoke all on function private.stamp_photo_consent() from public,anon,authenticated;
create trigger stamp_photo_consent before insert or update on public.children for each row execute function private.stamp_photo_consent();

-- Shared rules for every new table: members read, managers write, tenant cannot move, audited.
do $$
declare t text;
begin
 foreach t in array array['academic_years','academic_terms','holidays','grade_levels','sections','section_staff'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from public,anon,authenticated', t);
  execute format('grant select,insert,update,delete on public.%I to authenticated', t);
  execute format('create policy %I on public.%I for select to authenticated using(private.is_org_member(organization_id))', t || '_read', t);
  execute format('create policy %I on public.%I for insert to authenticated with check(private.can_manage_org(organization_id))', t || '_insert', t);
  execute format('create policy %I on public.%I for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id))', t || '_update', t);
  execute format('create policy %I on public.%I for delete to authenticated using(private.can_manage_org(organization_id))', t || '_delete', t);
  execute format('create trigger keep_record_tenant before update on public.%I for each row execute function private.keep_record_tenant()', t);
  execute format('create trigger audit_operation after insert or update or delete on public.%I for each row execute function private.audit_operation()', t);
  execute format('revoke truncate,references,trigger on public.%I from anon,authenticated', t);
 end loop;
end $$;
-- Identifiers and authorship are never chosen by the browser.
revoke insert,update on public.academic_years,public.academic_terms,public.holidays,public.grade_levels,public.sections,public.section_staff from authenticated;
grant insert(organization_id,name,starts_on,ends_on,is_current), update(name,starts_on,ends_on,is_current) on public.academic_years to authenticated;
grant insert(organization_id,academic_year_id,name,starts_on,ends_on), update(name,starts_on,ends_on) on public.academic_terms to authenticated;
grant insert(organization_id,name,starts_on,ends_on), update(name,starts_on,ends_on) on public.holidays to authenticated;
grant insert(organization_id,name,stage,sort_order), update(name,stage,sort_order) on public.grade_levels to authenticated;
grant insert(organization_id,grade_level_id,branch_id,name,gender,capacity,homeroom_teacher_id), update(grade_level_id,branch_id,name,gender,capacity,homeroom_teacher_id) on public.sections to authenticated;
grant insert(organization_id,section_id,user_id,duty), update(duty) on public.section_staff to authenticated;
commit;
