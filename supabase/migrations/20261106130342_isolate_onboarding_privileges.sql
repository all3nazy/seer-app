-- Keep privileged onboarding code outside the exposed Data API schema.
begin;
alter function public.claim_organization_invitation() set schema private;
revoke all on function private.claim_organization_invitation() from public,anon,authenticated,service_role;
grant execute on function private.claim_organization_invitation() to authenticated;
create function public.claim_organization_invitation() returns uuid
language sql security invoker set search_path = '' as $$
 select private.claim_organization_invitation()
$$;
revoke all on function public.claim_organization_invitation() from public,anon,authenticated,service_role;
grant execute on function public.claim_organization_invitation() to authenticated;
commit;
