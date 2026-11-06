-- Forward-only reconciliation: safe for the baseline and the observed live schema.
-- Never reapply 0001_core.sql to an existing database.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create or replace function private.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.memberships m where m.organization_id=org and m.user_id=(select auth.uid()))
$$;
revoke all on function private.is_org_member(uuid) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated;
drop policy if exists org_read on public.organizations;
create policy org_read on public.organizations for select to authenticated using(private.is_org_member(id));
drop policy if exists membership_read on public.memberships;
create policy membership_read on public.memberships for select to authenticated using(private.is_org_member(organization_id));
drop policy if exists branches_read on public.branches;
create policy branches_read on public.branches for select to authenticated using(private.is_org_member(organization_id));
drop policy if exists guardians_read on public.guardians;
create policy guardians_read on public.guardians for select to authenticated using(private.is_org_member(organization_id));
drop policy if exists children_read on public.children;
create policy children_read on public.children for select to authenticated using(private.is_org_member(organization_id));
drop policy if exists child_guardians_read on public.child_guardians;
create policy child_guardians_read on public.child_guardians for select to authenticated using(private.is_org_member(organization_id));
drop policy if exists enrollments_read on public.enrollments;
create policy enrollments_read on public.enrollments for select to authenticated using(private.is_org_member(organization_id));
drop policy if exists invoices_read on public.invoices;
create policy invoices_read on public.invoices for select to authenticated using(private.is_org_member(organization_id));
drop function if exists public.is_org_member(uuid);
-- Existing live constraints use these same names. Add only what is missing.
do $$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.branches'::regclass and conname='branches_id_organization_id_key') then
 alter table public.branches add constraint branches_id_organization_id_key unique(id,organization_id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.children'::regclass and conname='children_id_organization_id_key') then
 alter table public.children add constraint children_id_organization_id_key unique(id,organization_id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.guardians'::regclass and conname='guardians_id_organization_id_key') then
 alter table public.guardians add constraint guardians_id_organization_id_key unique(id,organization_id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.child_guardians'::regclass and conname='child_guardians_child_id_organization_id_fkey') then
 alter table public.child_guardians add constraint child_guardians_child_id_organization_id_fkey foreign key(child_id,organization_id) references public.children(id,organization_id) on delete cascade not valid;
 end if;
 alter table public.child_guardians validate constraint child_guardians_child_id_organization_id_fkey;
 alter table public.child_guardians drop constraint if exists child_guardians_child_id_fkey;
 if not exists(select 1 from pg_constraint where conrelid='public.child_guardians'::regclass and conname='child_guardians_guardian_id_organization_id_fkey') then
 alter table public.child_guardians add constraint child_guardians_guardian_id_organization_id_fkey foreign key(guardian_id,organization_id) references public.guardians(id,organization_id) on delete cascade not valid;
 end if;
 alter table public.child_guardians validate constraint child_guardians_guardian_id_organization_id_fkey;
 alter table public.child_guardians drop constraint if exists child_guardians_guardian_id_fkey;
 if not exists(select 1 from pg_constraint where conrelid='public.enrollments'::regclass and conname='enrollments_child_id_organization_id_fkey') then
 alter table public.enrollments add constraint enrollments_child_id_organization_id_fkey foreign key(child_id,organization_id) references public.children(id,organization_id) not valid;
 end if;
 alter table public.enrollments validate constraint enrollments_child_id_organization_id_fkey;
 alter table public.enrollments drop constraint if exists enrollments_child_id_fkey;
 if not exists(select 1 from pg_constraint where conrelid='public.enrollments'::regclass and conname='enrollments_branch_id_organization_id_fkey') then
 alter table public.enrollments add constraint enrollments_branch_id_organization_id_fkey foreign key(branch_id,organization_id) references public.branches(id,organization_id) not valid;
 end if;
 alter table public.enrollments validate constraint enrollments_branch_id_organization_id_fkey;
 alter table public.enrollments drop constraint if exists enrollments_branch_id_fkey;
 if not exists(select 1 from pg_constraint where conrelid='public.invoices'::regclass and conname='invoices_guardian_id_organization_id_fkey') then
 alter table public.invoices add constraint invoices_guardian_id_organization_id_fkey foreign key(guardian_id,organization_id) references public.guardians(id,organization_id) not valid;
 end if;
 alter table public.invoices validate constraint invoices_guardian_id_organization_id_fkey;
 alter table public.invoices drop constraint if exists invoices_guardian_id_fkey;
end $$;
commit;
