begin;
create or replace function private.can_manage_org(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.memberships m where m.organization_id=org and m.user_id=(select auth.uid()) and m.role in ('owner','admin'))
$$;
revoke all on function private.can_manage_org(uuid) from public, anon;
grant execute on function private.can_manage_org(uuid) to authenticated;

create table public.audit_events (
 id bigint generated always as identity primary key,
 organization_id uuid not null references public.organizations(id),
 actor_id uuid references auth.users(id) on delete set null,
 entity text not null,
 record_id uuid not null,
 action text not null check(action in ('INSERT','UPDATE','DELETE')),
 created_at timestamptz not null default now()
);
alter table public.audit_events enable row level security;
revoke all on public.audit_events from anon,authenticated;
grant select on public.audit_events to authenticated;
create policy audit_read on public.audit_events for select to authenticated using(private.can_manage_org(organization_id));
create index audit_events_org_time_idx on public.audit_events(organization_id,created_at desc);
-- Trigger stores identifiers only, never child names, dates, phone numbers or values.
create function private.audit_operation() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if TG_OP='DELETE' then
  insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values(old.organization_id,auth.uid(),TG_TABLE_NAME,old.id,TG_OP);
  return old;
 end if;
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values(new.organization_id,auth.uid(),TG_TABLE_NAME,new.id,TG_OP);
 return new;
end $$;
revoke all on function private.audit_operation() from public,anon,authenticated;
-- Even an administrator cannot silently move a record between organizations.
create function private.keep_record_tenant() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.organization_id <> old.organization_id then raise exception 'Tenant cannot change' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.keep_record_tenant() from public,anon,authenticated;

grant select,insert,update on public.branches to authenticated;
create policy branches_insert on public.branches for insert to authenticated with check(private.can_manage_org(organization_id));
create policy branches_update on public.branches for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id));
create trigger audit_operation after insert or update on public.branches for each row execute function private.audit_operation();
create trigger keep_record_tenant before update on public.branches for each row execute function private.keep_record_tenant();

grant select,insert,update on public.children to authenticated;
create policy children_insert on public.children for insert to authenticated with check(private.can_manage_org(organization_id));
create policy children_update on public.children for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id));
create trigger audit_operation after insert or update on public.children for each row execute function private.audit_operation();
create trigger keep_record_tenant before update on public.children for each row execute function private.keep_record_tenant();

grant select,insert,update on public.guardians to authenticated;
create policy guardians_insert on public.guardians for insert to authenticated with check(private.can_manage_org(organization_id));
create policy guardians_update on public.guardians for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id));
create trigger audit_operation after insert or update on public.guardians for each row execute function private.audit_operation();
create trigger keep_record_tenant before update on public.guardians for each row execute function private.keep_record_tenant();

grant select,insert,update on public.enrollments to authenticated;
create policy enrollments_insert on public.enrollments for insert to authenticated with check(private.can_manage_org(organization_id));
create policy enrollments_update on public.enrollments for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id));
create trigger audit_operation after insert or update on public.enrollments for each row execute function private.audit_operation();
create trigger keep_record_tenant before update on public.enrollments for each row execute function private.keep_record_tenant();

grant select,insert,update on public.invoices to authenticated;
create policy invoices_insert on public.invoices for insert to authenticated with check(private.can_manage_org(organization_id));
create policy invoices_update on public.invoices for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id));
create trigger audit_operation after insert or update on public.invoices for each row execute function private.audit_operation();
create trigger keep_record_tenant before update on public.invoices for each row execute function private.keep_record_tenant();
-- Staff can see operational counts, but invoice records are restricted to managers.
drop policy invoices_read on public.invoices;
create policy invoices_read on public.invoices for select to authenticated using(private.can_manage_org(organization_id));
-- RLS does not protect TRUNCATE. Remove non-API capabilities inherited from project defaults.
revoke truncate,references,trigger on public.organizations,public.memberships,public.branches,public.guardians,public.children,public.child_guardians,public.enrollments,public.invoices from anon,authenticated;
-- Do not depend on Supabase project default privileges for core reads.
grant select on public.organizations,public.memberships,public.child_guardians to authenticated;
-- Existing Supabase projects may have a table-wide UPDATE default grant.
revoke update on public.organizations from authenticated;
grant update(name,type) on public.organizations to authenticated;
create policy organizations_update on public.organizations for update to authenticated using(private.can_manage_org(id)) with check(private.can_manage_org(id));
create function private.audit_organization_update() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values(new.id,auth.uid(),TG_TABLE_NAME,new.id,TG_OP);
 return new;
end $$;
revoke all on function private.audit_organization_update() from public,anon,authenticated;
create trigger audit_organization_update after update on public.organizations for each row execute function private.audit_organization_update();
-- Membership writes and organization creation remain operator-only.
create function public.bootstrap_organization(admin_user uuid, org_name text, org_type text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare org_id uuid;
begin
 if length(btrim(org_name)) not between 1 and 120 then raise exception 'Invalid organization name'; end if;
 if not exists(select 1 from auth.users where id=admin_user and email_confirmed_at is not null) then raise exception 'A verified administrator is required'; end if;
 insert into public.organizations(name,type) values(btrim(org_name),org_type) returning id into org_id;
 insert into public.memberships(organization_id,user_id,role) values(org_id,admin_user,'owner');
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values(org_id,admin_user,'organizations',org_id,'INSERT');
 return org_id;
end $$;
revoke all on function public.bootstrap_organization(uuid,text,text) from public,anon,authenticated;
grant execute on function public.bootstrap_organization(uuid,text,text) to service_role;
alter table public.branches add constraint branches_name_length check(length(btrim(name)) between 1 and 120) not valid;
alter table public.branches validate constraint branches_name_length;
alter table public.children add constraint children_name_length check(length(btrim(full_name)) between 1 and 120) not valid;
alter table public.children validate constraint children_name_length;
alter table public.guardians add constraint guardians_name_length check(length(btrim(full_name)) between 1 and 120) not valid;
alter table public.guardians validate constraint guardians_name_length;
commit;
