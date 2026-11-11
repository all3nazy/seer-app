-- Pilot launch.
-- 1) Owner consent: each owner accepts the terms and the privacy policy for their organization, per
--    version of the legal texts. Rows are kept as a record (no update or delete) and written only
--    through accept_legal(), which checks that the caller owns the organization.
-- 2) my_organizations() also returns the person's display name in each organization and the legal
--    version they last accepted there, so the dashboard needs no extra request for either.
-- 3) The platform console can extend a subscription by calendar months (pilot schools).
-- Forward-only.
begin;

-- 1) Owner consent ---------------------------------------------------------------------------------
create table public.legal_acceptances (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 version text not null check (version ~ '^[0-9A-Za-z.-]{1,40}$'),
 accepted_at timestamptz not null default now(),
 unique (organization_id, user_id, version)
);
create index legal_acceptances_user_idx on public.legal_acceptances(user_id, organization_id, accepted_at desc);
alter table public.legal_acceptances enable row level security;
revoke all on public.legal_acceptances from public,anon,authenticated;
grant select on public.legal_acceptances to authenticated;
-- Each person sees their own acceptances; the platform admin sees all. Nobody writes directly.
create policy legal_acceptances_read on public.legal_acceptances for select to authenticated
 using (user_id = (select auth.uid()) or private.is_platform_admin());

-- Records the owner's acceptance of a version for an organization. Works while locked (raw check), so
-- an owner can always accept and reach the renewal page. Accepting the same version twice is a no-op.
create function private.accept_legal(org uuid, version text) returns timestamptz language plpgsql security definer set search_path = '' as $$
declare accepted timestamptz;
begin
 if not private.is_org_owner_raw(org) then raise exception 'Only the owner accepts' using errcode = '42501'; end if;
 if version is null or version !~ '^[0-9A-Za-z.-]{1,40}$' then raise exception 'Invalid version' using errcode = '22023'; end if;
 insert into public.legal_acceptances(organization_id, user_id, version) values (org, auth.uid(), version)
 on conflict on constraint legal_acceptances_organization_id_user_id_version_key do nothing;
 select a.accepted_at into accepted from public.legal_acceptances a where a.organization_id = org and a.user_id = auth.uid() and a.version = accept_legal.version;
 return accepted;
end $$;
revoke all on function private.accept_legal(uuid,text) from public,anon,authenticated;
grant execute on function private.accept_legal(uuid,text) to authenticated;
create function public.accept_legal(org uuid, version text) returns timestamptz language sql set search_path = '' as $$ select private.accept_legal(org, version) $$;
revoke all on function public.accept_legal(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.accept_legal(uuid,text) to authenticated;

-- 2) my_organizations(): adds display_name and legal_version ---------------------------------------
-- The return type changes, so both functions are dropped and created again with the same grants.
drop function public.my_organizations();
drop function private.my_organizations();
create function private.my_organizations() returns table(organization_id uuid, name text, type text, role text, access text, status text, ends_on date, days_left integer, plan_key text, features text[], disabled_features text[], primary_color text, accent_color text, display_name text, legal_version text)
language sql stable security definer set search_path = '' as $$
 select m.organization_id, o.name, o.type, m.role, private.org_access(m.organization_id), s.status, s.ends_on, s.ends_on - private.riyadh_today(), p.key,
  case when s.status = 'trial' or s.organization_id is null then private.feature_keys() else p.features end,
  coalesce(os.disabled_features, '{}'), os.primary_color, os.accent_color, m.display_name,
  (select a.version from public.legal_acceptances a where a.organization_id = m.organization_id and a.user_id = m.user_id order by a.accepted_at desc limit 1)
 from public.memberships m join public.organizations o on o.id = m.organization_id
 left join public.subscriptions s on s.organization_id = m.organization_id left join public.plans p on p.id = s.plan_id
 left join public.organization_settings os on os.organization_id = m.organization_id
 where m.user_id = auth.uid()
 order by m.joined_at
$$;
revoke all on function private.my_organizations() from public,anon,authenticated;
grant execute on function private.my_organizations() to authenticated;
create function public.my_organizations() returns table(organization_id uuid, name text, type text, role text, access text, status text, ends_on date, days_left integer, plan_key text, features text[], disabled_features text[], primary_color text, accent_color text, display_name text, legal_version text)
language sql stable set search_path = '' as $$ select * from private.my_organizations() $$;
revoke all on function public.my_organizations() from public,anon,authenticated,service_role;
grant execute on function public.my_organizations() to authenticated;

-- 3) Extend by calendar months (platform admins only, audited) -------------------------------------
create function private.admin_extend_months(org uuid, months integer) returns date language plpgsql security definer set search_path = '' as $$
declare new_end date;
begin
 perform private.require_platform_admin();
 if months is null or months not between 1 and 24 then raise exception 'Months must be 1 to 24' using errcode = '22023'; end if;
 update public.subscriptions s set ends_on = (greatest(s.ends_on, private.riyadh_today()) + make_interval(months => months))::date, updated_at = now()
 where s.organization_id = org returning s.ends_on into new_end;
 if new_end is null then raise exception 'No subscription' using errcode = 'P0002'; end if;
 perform private.sync_status(org);
 perform private.audit_subscription(org, 'UPDATE');
 perform private.notify_owners(org, 'تم تمديد اشتراكك', 'ساري حتى ' || to_char(new_end, 'YYYY-MM-DD'));
 return new_end;
end $$;
revoke all on function private.admin_extend_months(uuid,integer) from public,anon,authenticated;
grant execute on function private.admin_extend_months(uuid,integer) to authenticated;
create function public.admin_extend_months(org uuid, months integer) returns date language sql set search_path = '' as $$ select private.admin_extend_months(org, months) $$;
revoke all on function public.admin_extend_months(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_extend_months(uuid,integer) to authenticated;
commit;
