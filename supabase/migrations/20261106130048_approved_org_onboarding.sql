-- Operator approves an email and organization before a verified user may claim it.
-- No service-role credential is needed by the application runtime.
begin;
create table private.organization_invitations (
 email text primary key check (email = lower(btrim(email)) and length(email) between 3 and 254 and position('@' in email) > 1),
 org_name text not null check (length(btrim(org_name)) between 1 and 120),
 org_type text not null check (org_type in ('school','nursery','kindergarten')),
 expires_at timestamptz not null,
 claimed_by uuid references auth.users(id),
 organization_id uuid references public.organizations(id),
 claimed_at timestamptz,
 constraint organization_invitation_claim_state check (
  (claimed_by is null and organization_id is null and claimed_at is null) or
  (claimed_by is not null and organization_id is not null and claimed_at is not null)
 )
);
alter table private.organization_invitations enable row level security;
revoke all on private.organization_invitations from public,anon,authenticated,service_role;

create function public.claim_organization_invitation() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
 claiming_user uuid := auth.uid();
 verified_email text;
 invitation private.organization_invitations%rowtype;
 org_id uuid;
begin
 if claiming_user is null then
  raise exception 'An authenticated verified account is required' using errcode='42501';
 end if;
 -- Only Auth's actual confirmed email is trusted. Never use JWT/user metadata.
 select lower(btrim(u.email)) into verified_email from auth.users u
 where u.id=claiming_user and u.email_confirmed_at is not null and u.email is not null;
 if verified_email is null then
  raise exception 'An authenticated verified account is required' using errcode='42501';
 end if;
 -- Serializes retries and concurrent claims of the same approved email.
 select * into invitation from private.organization_invitations i
 where i.email=verified_email for update;
 if not found then
  raise exception 'No valid organization invitation is available' using errcode='42501';
 end if;
 if invitation.claimed_by is not null then
  if invitation.claimed_by=claiming_user and exists(
   select 1 from public.memberships m where m.organization_id=invitation.organization_id
   and m.user_id=claiming_user and m.role='owner'
  ) then
   return invitation.organization_id;
  end if;
  raise exception 'No valid organization invitation is available' using errcode='42501';
 end if;
 if invitation.expires_at <= statement_timestamp() then
  raise exception 'No valid organization invitation is available' using errcode='42501';
 end if;
 org_id := public.bootstrap_organization(claiming_user,invitation.org_name,invitation.org_type);
 update private.organization_invitations set claimed_by=claiming_user,organization_id=org_id,claimed_at=statement_timestamp()
 where email=verified_email;
 return org_id;
end $$;
revoke all on function public.claim_organization_invitation() from public,anon,authenticated,service_role;
grant execute on function public.claim_organization_invitation() to authenticated;
commit;
