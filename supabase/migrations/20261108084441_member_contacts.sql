-- Contact details for sending a member their tasks over WhatsApp or email.
-- Forward-only; apply once after review. Phones live in their own table so that only the member
-- and the organization's managers can read them (membership rows are visible to all colleagues).
begin;
create table public.member_phones (
 organization_id uuid not null,
 user_id uuid not null,
 phone text not null check (phone ~ '^\+?[0-9]{8,15}$'),
 updated_at timestamptz not null default now(),
 primary key (organization_id,user_id),
 constraint member_phones_member_fkey foreign key (organization_id,user_id) references public.memberships(organization_id,user_id) on delete cascade
);
alter table public.member_phones enable row level security;
revoke all on public.member_phones from public,anon,authenticated;
grant select,delete on public.member_phones to authenticated;
grant insert(organization_id,user_id,phone), update(phone) on public.member_phones to authenticated;
create policy member_phones_read on public.member_phones for select to authenticated
 using(user_id = (select auth.uid()) or private.can_manage_org(organization_id));
create policy member_phones_insert on public.member_phones for insert to authenticated
 with check(private.is_org_member(organization_id) and (user_id = (select auth.uid()) or private.can_manage_org(organization_id)));
create policy member_phones_update on public.member_phones for update to authenticated
 using(user_id = (select auth.uid()) or private.can_manage_org(organization_id))
 with check(user_id = (select auth.uid()) or private.can_manage_org(organization_id));
create policy member_phones_delete on public.member_phones for delete to authenticated
 using(user_id = (select auth.uid()) or private.can_manage_org(organization_id));
create function private.touch_member_phone() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function private.touch_member_phone() from public,anon,authenticated;
create trigger touch_member_phone before insert or update on public.member_phones for each row execute function private.touch_member_phone();
create trigger keep_record_tenant before update on public.member_phones for each row execute function private.keep_record_tenant();
revoke truncate,references,trigger on public.member_phones from anon,authenticated;

-- Managers see their members' sign-in emails and phones; nobody else does.
create function private.member_contacts(org uuid)
returns table(user_id uuid, email text, phone text)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.can_manage_org(org) then raise exception 'Only managers view member contacts' using errcode = '42501'; end if;
 return query select m.user_id, u.email::text, p.phone
  from public.memberships m join auth.users u on u.id = m.user_id
  left join public.member_phones p on p.organization_id = m.organization_id and p.user_id = m.user_id
  where m.organization_id = org;
end $$;
revoke all on function private.member_contacts(uuid) from public,anon,authenticated,service_role;
grant execute on function private.member_contacts(uuid) to authenticated;
create function public.member_contacts(org uuid) returns table(user_id uuid, email text, phone text)
 language sql stable security invoker set search_path = '' as $$ select * from private.member_contacts(org) $$;
revoke all on function public.member_contacts(uuid) from public,anon,authenticated,service_role;
grant execute on function public.member_contacts(uuid) to authenticated;
commit;
