-- Team management, task assignment, record deletion and child–guardian links.
-- Forward-only; apply once after review. Every write path stays tenant-scoped and audited.
begin;

-- 1) Record deletion: managers only. Financial records may be deleted only while still a draft;
--    issued or paid invoices must be voided instead. Foreign keys still block deleting a child,
--    branch or guardian that other records depend on.
grant delete on public.branches,public.children,public.guardians,public.enrollments,public.invoices to authenticated;
create policy branches_delete on public.branches for delete to authenticated using(private.can_manage_org(organization_id));
create policy children_delete on public.children for delete to authenticated using(private.can_manage_org(organization_id));
create policy guardians_delete on public.guardians for delete to authenticated using(private.can_manage_org(organization_id));
create policy enrollments_delete on public.enrollments for delete to authenticated using(private.can_manage_org(organization_id));
create policy invoices_delete on public.invoices for delete to authenticated using(private.can_manage_org(organization_id) and status = 'draft');
create trigger audit_operation_delete after delete on public.branches for each row execute function private.audit_operation();
create trigger audit_operation_delete after delete on public.children for each row execute function private.audit_operation();
create trigger audit_operation_delete after delete on public.guardians for each row execute function private.audit_operation();
create trigger audit_operation_delete after delete on public.enrollments for each row execute function private.audit_operation();
create trigger audit_operation_delete after delete on public.invoices for each row execute function private.audit_operation();

-- 2) Child–guardian links (table and tenant-safe composite keys already exist).
alter table public.child_guardians add constraint child_guardians_relationship_check
 check (relationship in ('father','mother','guardian','other')) not valid;
alter table public.child_guardians validate constraint child_guardians_relationship_check;
grant insert(organization_id,child_id,guardian_id,relationship),delete on public.child_guardians to authenticated;
create policy child_guardians_insert on public.child_guardians for insert to authenticated with check(private.can_manage_org(organization_id));
create policy child_guardians_delete on public.child_guardians for delete to authenticated using(private.can_manage_org(organization_id));
-- The link has no id of its own; the audit event records the child it belongs to.
create function private.audit_child_guardian() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if TG_OP = 'DELETE' then
  insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values(old.organization_id,auth.uid(),'child_guardians',old.child_id,TG_OP);
  return old;
 end if;
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values(new.organization_id,auth.uid(),'child_guardians',new.child_id,TG_OP);
 return new;
end $$;
revoke all on function private.audit_child_guardian() from public,anon,authenticated;
create trigger audit_child_guardian after insert or delete on public.child_guardians for each row execute function private.audit_child_guardian();

-- 3) Team: display names, role changes and removal.
alter table public.memberships add column display_name text
 check (display_name is null or length(btrim(display_name)) between 1 and 80);
alter table public.memberships add column joined_at timestamptz not null default now();
grant update(display_name,role),delete on public.memberships to authenticated;
create policy memberships_update on public.memberships for update to authenticated
 using(private.can_manage_org(organization_id) or user_id = (select auth.uid()))
 with check(private.can_manage_org(organization_id) or user_id = (select auth.uid()));
create policy memberships_delete on public.memberships for delete to authenticated using(private.can_manage_org(organization_id));

-- Rules a policy cannot express: only owners change roles or remove managers, nobody changes
-- their own role or removes themselves, and an organization always keeps at least one owner.
-- Actions without a session (operator maintenance, account deletion cascades) are not blocked.
create function private.guard_membership() returns trigger language plpgsql security definer set search_path = '' as $$
declare
 actor uuid := auth.uid();
 actor_role text;
 target public.memberships%rowtype := old;
begin
 if actor is null then
  return case when TG_OP = 'DELETE' then old else new end;
 end if;
 select m.role into actor_role from public.memberships m where m.organization_id = target.organization_id and m.user_id = actor;
 if TG_OP = 'UPDATE' then
  if new.organization_id <> old.organization_id or new.user_id <> old.user_id or new.joined_at <> old.joined_at then
   raise exception 'Membership identity cannot change' using errcode = '42501';
  end if;
  if new.role is distinct from old.role then
   if actor_role is distinct from 'owner' then raise exception 'Only owners change roles' using errcode = '42501'; end if;
   if old.user_id = actor then raise exception 'You cannot change your own role' using errcode = '42501'; end if;
  end if;
  if new.display_name is distinct from old.display_name and old.user_id <> actor and actor_role not in ('owner','admin') then
   raise exception 'Only managers rename other members' using errcode = '42501';
  end if;
 else
  if old.user_id = actor then raise exception 'You cannot remove yourself' using errcode = '42501'; end if;
  if old.role in ('owner','admin') and actor_role is distinct from 'owner' then
   raise exception 'Only owners remove managers' using errcode = '42501';
  end if;
 end if;
 if old.role = 'owner' and (TG_OP = 'DELETE' or new.role <> 'owner') and not exists(
  select 1 from public.memberships m where m.organization_id = old.organization_id and m.role = 'owner' and m.user_id <> old.user_id
 ) then
  raise exception 'An organization must keep an owner' using errcode = '23514';
 end if;
 return case when TG_OP = 'DELETE' then old else new end;
end $$;
revoke all on function private.guard_membership() from public,anon,authenticated;
create trigger guard_membership before update or delete on public.memberships for each row execute function private.guard_membership();
create function private.audit_membership() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if TG_OP = 'DELETE' then
  insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values(old.organization_id,auth.uid(),'memberships',old.user_id,TG_OP);
  return old;
 end if;
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values(new.organization_id,auth.uid(),'memberships',new.user_id,TG_OP);
 return new;
end $$;
revoke all on function private.audit_membership() from public,anon,authenticated;
-- Inserts are audited by the functions that create memberships, keeping onboarding events unchanged.
create trigger audit_membership after update or delete on public.memberships for each row execute function private.audit_membership();

-- 4) Task assignment: the assignee must be a member of the same organization.
alter table public.tasks add column assignee_id uuid;
alter table public.tasks add constraint tasks_assignee_member_fkey foreign key (organization_id,assignee_id)
 references public.memberships(organization_id,user_id) on delete set null (assignee_id);
create index tasks_org_assignee_idx on public.tasks(organization_id,assignee_id) where status <> 'done';
grant insert(assignee_id),update(assignee_id) on public.tasks to authenticated;
create or replace function private.guard_task() returns trigger language plpgsql set search_path = '' as $$
begin
 if TG_OP = 'INSERT' then
  new.created_by := auth.uid();
  new.created_at := now();
 else
  if (new.title, new.notes, new.priority, new.due_date, new.assignee_id) is distinct from (old.title, old.notes, old.priority, old.due_date, old.assignee_id)
     and auth.uid() is not null and not private.can_manage_org(new.organization_id) then
   raise exception 'Only managers can edit task details' using errcode = '42501';
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
 end if;
 new.updated_at := now();
 new.completed_at := case when new.status = 'done' then coalesce(case when TG_OP = 'UPDATE' and old.status = 'done' then old.completed_at end, now()) end;
 return new;
end $$;

-- 5) Member invitations: a manager approves an email; the person activates an account with that
--    email, and the verified address — never a client-supplied value — claims the seat.
create table private.member_invitations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
 role text not null check (role in ('admin','staff')),
 display_name text check (display_name is null or length(btrim(display_name)) between 1 and 80),
 invited_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 claimed_by uuid references auth.users(id) on delete set null,
 claimed_at timestamptz,
 revoked_at timestamptz
);
create unique index member_invitations_open_idx on private.member_invitations(organization_id,email) where claimed_at is null and revoked_at is null;
create index member_invitations_email_idx on private.member_invitations(email) where claimed_at is null and revoked_at is null;
alter table private.member_invitations enable row level security;
revoke all on private.member_invitations from public,anon,authenticated,service_role;

create function private.invite_member(org uuid, invitee_email text, invitee_role text, invitee_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
 actor uuid := auth.uid();
 actor_role text;
 normalized text := lower(btrim(coalesce(invitee_email,'')));
 cleaned_name text := nullif(btrim(coalesce(invitee_name,'')),'');
 invitation_id uuid;
begin
 select m.role into actor_role from public.memberships m where m.organization_id = org and m.user_id = actor;
 if actor is null or actor_role is null or actor_role not in ('owner','admin') then
  raise exception 'Only managers invite members' using errcode = '42501';
 end if;
 if invitee_role not in ('admin','staff') or (actor_role = 'admin' and invitee_role <> 'staff') then
  raise exception 'This role cannot be granted' using errcode = '42501';
 end if;
 if exists(select 1 from public.memberships m join auth.users u on u.id = m.user_id
           where m.organization_id = org and lower(u.email) = normalized) then
  raise exception 'Already a member' using errcode = '23505';
 end if;
 update private.member_invitations set role = invitee_role, display_name = cleaned_name, invited_by = actor,
  expires_at = statement_timestamp() + interval '14 days'
 where organization_id = org and email = normalized and claimed_at is null and revoked_at is null
 returning id into invitation_id;
 if invitation_id is null then
  insert into private.member_invitations(organization_id,email,role,display_name,invited_by,expires_at)
  values(org,normalized,invitee_role,cleaned_name,actor,statement_timestamp() + interval '14 days')
  returning id into invitation_id;
 end if;
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values(org,actor,'member_invitations',invitation_id,'INSERT');
 return invitation_id;
end $$;

create function private.revoke_member_invitation(invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
 actor uuid := auth.uid();
 target private.member_invitations%rowtype;
 actor_role text;
begin
 select * into target from private.member_invitations i where i.id = invitation and i.claimed_at is null and i.revoked_at is null for update;
 if not found then raise exception 'Invitation not found' using errcode = 'P0002'; end if;
 select m.role into actor_role from public.memberships m where m.organization_id = target.organization_id and m.user_id = actor;
 if actor is null or actor_role is null or actor_role not in ('owner','admin') or (actor_role = 'admin' and target.role <> 'staff') then
  raise exception 'Invitation not found' using errcode = 'P0002';
 end if;
 update private.member_invitations set revoked_at = statement_timestamp() where id = invitation;
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values(target.organization_id,actor,'member_invitations',invitation,'DELETE');
end $$;

create function private.list_member_invitations(org uuid)
returns table(id uuid, email text, role text, display_name text, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.can_manage_org(org) then raise exception 'Only managers view invitations' using errcode = '42501'; end if;
 return query select i.id,i.email,i.role,i.display_name,i.expires_at from private.member_invitations i
  where i.organization_id = org and i.claimed_at is null and i.revoked_at is null and i.expires_at > statement_timestamp()
  order by i.created_at desc;
end $$;

create function private.claim_member_invitations() returns integer
language plpgsql security definer set search_path = '' as $$
declare
 claiming_user uuid := auth.uid();
 verified_email text;
 invitation private.member_invitations%rowtype;
 joined integer := 0;
begin
 if claiming_user is null then return 0; end if;
 -- Only Auth's confirmed email is trusted; JWT and user metadata are ignored.
 select lower(btrim(u.email)) into verified_email from auth.users u
  where u.id = claiming_user and u.email_confirmed_at is not null and u.email is not null;
 if verified_email is null then return 0; end if;
 for invitation in select * from private.member_invitations i
   where i.email = verified_email and i.claimed_at is null and i.revoked_at is null and i.expires_at > statement_timestamp()
   for update loop
  insert into public.memberships(organization_id,user_id,role,display_name)
   values(invitation.organization_id,claiming_user,invitation.role,invitation.display_name)
   on conflict (organization_id,user_id) do nothing;
  if found then
   joined := joined + 1;
   insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values(invitation.organization_id,claiming_user,'memberships',claiming_user,'INSERT');
  end if;
  update private.member_invitations set claimed_by = claiming_user, claimed_at = statement_timestamp() where id = invitation.id;
 end loop;
 return joined;
end $$;

revoke all on function private.invite_member(uuid,text,text,text),private.revoke_member_invitation(uuid),
 private.list_member_invitations(uuid),private.claim_member_invitations() from public,anon,authenticated,service_role;
grant execute on function private.invite_member(uuid,text,text,text),private.revoke_member_invitation(uuid),
 private.list_member_invitations(uuid),private.claim_member_invitations() to authenticated;

-- Exposed entry points are thin invokers, as for organization onboarding.
create function public.invite_member(org uuid, invitee_email text, invitee_role text, invitee_name text) returns uuid
 language sql security invoker set search_path = '' as $$ select private.invite_member(org,invitee_email,invitee_role,invitee_name) $$;
create function public.revoke_member_invitation(invitation uuid) returns void
 language sql security invoker set search_path = '' as $$ select private.revoke_member_invitation(invitation) $$;
create function public.list_member_invitations(org uuid) returns table(id uuid, email text, role text, display_name text, expires_at timestamptz)
 language sql stable security invoker set search_path = '' as $$ select * from private.list_member_invitations(org) $$;
create function public.claim_member_invitations() returns integer
 language sql security invoker set search_path = '' as $$ select private.claim_member_invitations() $$;
revoke all on function public.invite_member(uuid,text,text,text),public.revoke_member_invitation(uuid),
 public.list_member_invitations(uuid),public.claim_member_invitations() from public,anon,authenticated,service_role;
grant execute on function public.invite_member(uuid,text,text,text),public.revoke_member_invitation(uuid),
 public.list_member_invitations(uuid),public.claim_member_invitations() to authenticated;
commit;
