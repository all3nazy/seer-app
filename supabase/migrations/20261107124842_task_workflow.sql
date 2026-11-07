-- Task workflow: a lightweight board per organization.
-- Members read and move tasks between stages; owners/admins create, edit and delete.
-- Forward-only; apply once after review. Stores no child or guardian data.
begin;
create table public.tasks (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 120),
 notes text check(notes is null or length(notes) <= 1000),
 status text not null default 'todo' check(status in ('todo','doing','review','done')),
 priority text not null default 'normal' check(priority in ('low','normal','high')),
 due_date date,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz,
 constraint tasks_id_organization_id_key unique(id,organization_id)
);
create index tasks_org_status_idx on public.tasks(organization_id,status);
create index tasks_org_due_idx on public.tasks(organization_id,due_date) where status <> 'done';
alter table public.tasks enable row level security;
revoke all on public.tasks from public,anon,authenticated;
-- Column grants: id, author and timestamps can never be supplied by the browser.
grant select,delete on public.tasks to authenticated;
grant insert(organization_id,title,notes,status,priority,due_date) on public.tasks to authenticated;
grant update(title,notes,status,priority,due_date) on public.tasks to authenticated;
create policy tasks_read on public.tasks for select to authenticated using(private.is_org_member(organization_id));
create policy tasks_insert on public.tasks for insert to authenticated with check(private.can_manage_org(organization_id));
create policy tasks_update on public.tasks for update to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id));
create policy tasks_delete on public.tasks for delete to authenticated using(private.can_manage_org(organization_id));

-- Staff may only move a task between stages; every other field needs a manager.
create function private.guard_task() returns trigger language plpgsql set search_path = '' as $$
begin
 if TG_OP = 'INSERT' then
  new.created_by := auth.uid();
  new.created_at := now();
 else
  if (new.title, new.notes, new.priority, new.due_date) is distinct from (old.title, old.notes, old.priority, old.due_date)
     and not private.can_manage_org(new.organization_id) then
   raise exception 'Only managers can edit task details' using errcode = '42501';
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
 end if;
 new.updated_at := now();
 new.completed_at := case when new.status = 'done' then coalesce(case when TG_OP = 'UPDATE' and old.status = 'done' then old.completed_at end, now()) end;
 return new;
end $$;
revoke all on function private.guard_task() from public,anon,authenticated;
create trigger guard_task before insert or update on public.tasks for each row execute function private.guard_task();
create trigger keep_record_tenant before update on public.tasks for each row execute function private.keep_record_tenant();
create trigger audit_operation after insert or update or delete on public.tasks for each row execute function private.audit_operation();
commit;
