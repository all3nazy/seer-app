-- Organization invite links (no email needed).
-- 1) The platform admin creates an invite for a school or nursery: name, type, plan, free trial months
--    (1-12) and an internal note. A strong random token is returned once; only its SHA-256 hash is
--    stored. The link is valid for 7 days and for one use, and can be revoked or reissued.
-- 2) The owner opens the link, chooses their name, a username (or email) and a password, and accepts
--    the terms and privacy policy. In one transaction: the account is created (already confirmed, as
--    with staff join links) or the signed-in account is used, the organization is created with them
--    as owner, its subscription starts with the chosen plan and trial months, the legal acceptance is
--    recorded, and the invite is closed. The platform admins are notified.
-- 3) Every create, use and revoke is audited. Wrong tokens are limited per client (10 per 15 minutes).
--    The token never appears in an error message, and the app keeps it in the address #fragment, so
--    it is not sent to the web server or written to its logs.
-- Forward-only.
begin;

create table private.org_invites (
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
 org_name text not null check (length(btrim(org_name)) between 2 and 120),
 org_type text not null check (org_type in ('school','nursery','kindergarten')),
 plan_id uuid not null references public.plans(id),
 trial_months integer not null check (trial_months between 1 and 12),
 note text check (note is null or length(note) <= 500),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '7 days',
 used_at timestamptz,
 used_by uuid references auth.users(id) on delete set null,
 organization_id uuid references public.organizations(id) on delete set null,
 revoked_at timestamptz,
 replaced_by uuid references private.org_invites(id) on delete set null
);
create index org_invites_created_idx on private.org_invites(created_at desc);
alter table private.org_invites enable row level security;
revoke all on private.org_invites from public,anon,authenticated;

-- Failed token lookups, keyed by a hash of the client address (the address itself is not stored).
create table private.org_invite_attempts (
 client_key text not null,
 at timestamptz not null default now()
);
create index org_invite_attempts_idx on private.org_invite_attempts(client_key, at desc);
alter table private.org_invite_attempts enable row level security;
revoke all on private.org_invite_attempts from public,anon,authenticated;

create function private.invite_hash(token text) returns text language sql immutable set search_path = '' as $$
 select encode(sha256(convert_to(coalesce(token,''), 'UTF8')), 'hex')
$$;
create function private.invite_client_key() returns text language sql stable set search_path = '' as $$
 select encode(sha256(convert_to(coalesce(
   nullif(btrim(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), ''),
   nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip', 'unknown'), 'UTF8')), 'hex')
$$;
-- True when this client has made too many wrong attempts in the last 15 minutes.
create function private.invite_blocked() returns boolean language sql stable security definer set search_path = '' as $$
 select (select count(*) from private.org_invite_attempts a where a.client_key = private.invite_client_key() and a.at > now() - interval '15 minutes') >= 10
$$;
create function private.invite_failed() returns void language sql security definer set search_path = '' as $$
 delete from private.org_invite_attempts where at < now() - interval '1 day';
 insert into private.org_invite_attempts(client_key) values (private.invite_client_key());
$$;
revoke all on function private.invite_hash(text), private.invite_client_key(), private.invite_blocked(), private.invite_failed() from public,anon,authenticated;

create function private.invite_status(i private.org_invites) returns text language sql stable set search_path = '' as $$
 select case when i.used_at is not null then 'used' when i.revoked_at is not null then 'revoked' when i.expires_at <= now() then 'expired' else 'pending' end
$$;
revoke all on function private.invite_status(private.org_invites) from public,anon,authenticated;

-- 1) Platform admin: create, list, revoke, reissue --------------------------------------------------
create function private.new_invite_token() returns text language sql volatile set search_path = '' as $$
 select private.random_code(32, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789')
$$;
revoke all on function private.new_invite_token() from public,anon,authenticated;

create function private.admin_create_org_invite(org_name text, org_type text, plan uuid, trial_months integer, note text) returns text language plpgsql security definer set search_path = '' as $$
declare token text := private.new_invite_token(); invite uuid; plan_id uuid := plan;
begin
 perform private.require_platform_admin();
 if length(btrim(coalesce(org_name,''))) not between 2 and 120 then raise exception 'Organization name is 2 to 120 characters' using errcode = '22023'; end if;
 if org_type is null or org_type not in ('school','nursery','kindergarten') then raise exception 'Choose the type' using errcode = '22023'; end if;
 if trial_months is null or trial_months not between 1 and 12 then raise exception 'Trial months are 1 to 12' using errcode = '22023'; end if;
 if plan_id is null then select p.id into plan_id from public.plans p where p.key = 'advanced'; end if;
 if not exists (select 1 from public.plans p where p.id = plan_id) then raise exception 'Unknown plan' using errcode = '22023'; end if;
 insert into private.org_invites(token_hash, org_name, org_type, plan_id, trial_months, note, created_by)
 values (private.invite_hash(token), btrim(org_name), org_type, plan_id, trial_months, nullif(left(btrim(coalesce(note,'')), 500), ''), auth.uid()) returning id into invite;
 insert into private.platform_audit(actor_id, action, detail) values (auth.uid(), 'org_invite_created',
  jsonb_build_object('invite', invite, 'org_name', btrim(org_name), 'org_type', org_type, 'plan', plan_id, 'trial_months', trial_months));
 return token;
end $$;

create function private.admin_org_invites() returns table(id uuid, org_name text, org_type text, plan text, trial_months integer, note text, status text, created_at timestamptz, expires_at timestamptz, used_at timestamptz, organization_id uuid, organization text)
language plpgsql stable security definer set search_path = '' as $$
begin
 perform private.require_platform_admin();
 return query
 select i.id, i.org_name, i.org_type, p.name, i.trial_months, i.note, private.invite_status(i), i.created_at, i.expires_at, i.used_at, i.organization_id, o.name
 from private.org_invites i join public.plans p on p.id = i.plan_id left join public.organizations o on o.id = i.organization_id
 order by (private.invite_status(i) = 'pending') desc, i.created_at desc
 limit 200;
end $$;

create function private.admin_revoke_org_invite(invite uuid) returns void language plpgsql security definer set search_path = '' as $$
declare i private.org_invites%rowtype;
begin
 perform private.require_platform_admin();
 select * into i from private.org_invites x where x.id = invite for update;
 if not found then raise exception 'Unknown invite' using errcode = 'P0002'; end if;
 if i.used_at is not null then raise exception 'This invite was already used' using errcode = '22023'; end if;
 if i.revoked_at is null then
  update private.org_invites set revoked_at = now() where id = invite;
  insert into private.platform_audit(actor_id, action, detail) values (auth.uid(), 'org_invite_revoked', jsonb_build_object('invite', invite, 'org_name', i.org_name));
 end if;
end $$;

-- A new link with the same details; the old one stops working.
create function private.admin_reissue_org_invite(invite uuid) returns text language plpgsql security definer set search_path = '' as $$
declare i private.org_invites%rowtype; token text := private.new_invite_token(); fresh uuid;
begin
 perform private.require_platform_admin();
 select * into i from private.org_invites x where x.id = invite for update;
 if not found then raise exception 'Unknown invite' using errcode = 'P0002'; end if;
 if i.used_at is not null then raise exception 'This invite was already used' using errcode = '22023'; end if;
 insert into private.org_invites(token_hash, org_name, org_type, plan_id, trial_months, note, created_by)
 values (private.invite_hash(token), i.org_name, i.org_type, i.plan_id, i.trial_months, i.note, auth.uid()) returning id into fresh;
 update private.org_invites set revoked_at = coalesce(revoked_at, now()), replaced_by = fresh where id = invite;
 insert into private.platform_audit(actor_id, action, detail) values (auth.uid(), 'org_invite_reissued', jsonb_build_object('invite', fresh, 'replaces', invite, 'org_name', i.org_name));
 return token;
end $$;

-- 2) The public link -------------------------------------------------------------------------------
-- What the invite page shows. Wrong tokens count towards the limit.
create function private.org_invite_view(token text) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare i private.org_invites%rowtype;
begin
 if private.invite_blocked() then return jsonb_build_object('valid', false, 'reason', 'blocked'); end if;
 select * into i from private.org_invites x where x.token_hash = private.invite_hash(btrim(token));
 if not found then perform private.invite_failed(); return jsonb_build_object('valid', false, 'reason', 'invalid'); end if;
 if private.invite_status(i) <> 'pending' then return jsonb_build_object('valid', false, 'reason', private.invite_status(i)); end if;
 return jsonb_build_object('valid', true, 'organization', i.org_name, 'type', i.org_type, 'trial_months', i.trial_months,
  'plan', (select p.name from public.plans p where p.id = i.plan_id), 'expires_at', i.expires_at);
end $$;

-- Uses the invite. Returns {ok, login, organization_id} or {ok: false, reason}. Problems with the
-- account details raise (22023 / 23505) after the token has been checked.
create function private.accept_org_invite(token text, login text, password text, name text, legal_version text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare i private.org_invites%rowtype; addr text; uid uuid := auth.uid(); org uuid; display text := nullif(btrim(coalesce(name,'')), '');
begin
 if private.invite_blocked() then return jsonb_build_object('ok', false, 'reason', 'blocked'); end if;
 select * into i from private.org_invites x where x.token_hash = private.invite_hash(btrim(token)) for update;
 if not found then perform private.invite_failed(); return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
 if private.invite_status(i) <> 'pending' then return jsonb_build_object('ok', false, 'reason', private.invite_status(i)); end if;
 if legal_version is null or legal_version !~ '^[0-9A-Za-z.-]{1,40}$' then raise exception 'Accept the terms and privacy policy' using errcode = '22023'; end if;
 if display is null or length(display) > 80 then raise exception 'Write your name' using errcode = '22023'; end if;
 if uid is null then
  addr := private.login_email(login);
  if length(coalesce(password,'')) < 8 or password !~ '[0-9]' or password !~ '[^0-9]' then raise exception 'Password needs 8+ characters with letters and numbers' using errcode = '22023'; end if;
  if exists (select 1 from auth.users u where lower(u.email) = addr) then raise exception 'This username or email is taken' using errcode = '23505'; end if;
  uid := gen_random_uuid();
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
  values ('00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated',addr,private.hash_password(password),now(),
          '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('joined_with','org_invite'),now(),now(),'','','','');
  insert into auth.identities(provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
  values (uid::text,uid,jsonb_build_object('sub',uid::text,'email',addr,'email_verified',true),'email',now(),now(),now());
 else
  select u.email into addr from auth.users u where u.id = uid;
 end if;
 -- The organization (its trial row is created by the start_trial trigger), then the invite's plan and months.
 insert into public.organizations(name, type) values (i.org_name, i.org_type) returning id into org;
 insert into public.memberships(organization_id, user_id, role, display_name) values (org, uid, 'owner', display);
 update public.subscriptions set plan_id = i.plan_id, status = 'trial', starts_on = private.riyadh_today(),
  ends_on = (private.riyadh_today() + make_interval(months => i.trial_months))::date, admin_notes = i.note, updated_at = now()
 where organization_id = org;
 insert into public.legal_acceptances(organization_id, user_id, version) values (org, uid, legal_version);
 update private.org_invites set used_at = now(), used_by = uid, organization_id = org where id = i.id;
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values (org, uid, 'org_invites', i.id, 'INSERT');
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values (org, uid, 'memberships', uid, 'INSERT');
 insert into private.platform_audit(actor_id, action, detail) values (uid, 'org_invite_used', jsonb_build_object('invite', i.id, 'organization', org, 'org_name', i.org_name));
 perform private.notify_platform_admins(org, 'signup', 'تفعّلت منشأة: ' || i.org_name, display || ' · تجربة ' || i.trial_months || ' أشهر', '/admin/subscribers/' || org);
 return jsonb_build_object('ok', true, 'login', addr, 'organization_id', org);
end $$;

revoke all on function private.admin_create_org_invite(text,text,uuid,integer,text), private.admin_org_invites(), private.admin_revoke_org_invite(uuid), private.admin_reissue_org_invite(uuid),
 private.org_invite_view(text), private.accept_org_invite(text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.admin_create_org_invite(text,text,uuid,integer,text), private.admin_org_invites(), private.admin_revoke_org_invite(uuid), private.admin_reissue_org_invite(uuid) to authenticated;
grant execute on function private.org_invite_view(text), private.accept_org_invite(text,text,text,text,text) to anon, authenticated;

create function public.admin_create_org_invite(org_name text, org_type text, plan uuid default null, trial_months integer default 3, note text default null) returns text language sql set search_path = '' as $$ select private.admin_create_org_invite(org_name, org_type, plan, trial_months, note) $$;
create function public.admin_org_invites() returns table(id uuid, org_name text, org_type text, plan text, trial_months integer, note text, status text, created_at timestamptz, expires_at timestamptz, used_at timestamptz, organization_id uuid, organization text)
 language sql stable set search_path = '' as $$ select * from private.admin_org_invites() $$;
create function public.admin_revoke_org_invite(invite uuid) returns void language sql set search_path = '' as $$ select private.admin_revoke_org_invite(invite) $$;
create function public.admin_reissue_org_invite(invite uuid) returns text language sql set search_path = '' as $$ select private.admin_reissue_org_invite(invite) $$;
create function public.org_invite_view(token text) returns jsonb language sql volatile set search_path = '' as $$ select private.org_invite_view(token) $$;
create function public.accept_org_invite(token text, login text default null, password text default null, name text default null, legal_version text default null) returns jsonb language sql set search_path = '' as $$ select private.accept_org_invite(token, login, password, name, legal_version) $$;
revoke all on function public.admin_create_org_invite(text,text,uuid,integer,text), public.admin_org_invites(), public.admin_revoke_org_invite(uuid), public.admin_reissue_org_invite(uuid),
 public.org_invite_view(text), public.accept_org_invite(text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_create_org_invite(text,text,uuid,integer,text), public.admin_org_invites(), public.admin_revoke_org_invite(uuid), public.admin_reissue_org_invite(uuid) to authenticated;
grant execute on function public.org_invite_view(text), public.accept_org_invite(text,text,text,text,text) to anon, authenticated;
commit;
