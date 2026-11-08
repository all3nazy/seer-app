-- Staff sign-in without email, and short links.
-- 1) Join links: a manager creates a link (/j/CODE) with a role and shares it on WhatsApp. The
--    employee opens it, chooses a username (or email) and a password, and is signed in at once as a
--    member of that organization. No email delivery is needed. Admins invite staff; owners may also
--    invite admins. Each link has a use limit and an expiry, and can be revoked.
-- 2) Managers can set a new password for a staff member who forgot theirs (owners also for admins).
-- 3) Short links (/s/CODE) stand in for long private links (invoices, quotes, family portal, pickup
--    confirmation), both in the app and in queued messages.
-- Forward-only.
begin;

-- Passwords are hashed with bcrypt, as Supabase Auth expects.
create function private.hash_password(password text) returns text language sql volatile security definer set search_path = '' as $$
 select extensions.crypt(password, extensions.gen_salt('bf'))
$$;
revoke all on function private.hash_password(text) from public,anon,authenticated;

-- A readable random code from an alphabet without look-alike characters.
create function private.random_code(len integer, alphabet text) returns text language plpgsql volatile set search_path = '' as $$
declare out text := ''; bytes bytea;
begin
 while length(out) < len loop
  bytes := uuid_send(gen_random_uuid());
  for i in 0..15 loop
   exit when length(out) >= len;
   out := out || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
 end loop;
 return out;
end $$;
revoke all on function private.random_code(integer,text) from public,anon,authenticated;

-- 1) Join links ------------------------------------------------------------------------------------
create table private.join_links (
 code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 role text not null check (role in ('admin','staff')),
 display_name text check (display_name is null or length(btrim(display_name)) between 1 and 80),
 max_uses integer not null default 1 check (max_uses between 1 and 50),
 uses integer not null default 0,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '7 days',
 revoked_at timestamptz
);
alter table private.join_links enable row level security;
revoke all on private.join_links from public,anon,authenticated;

create function private.can_invite(org uuid, invite_role text) returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.memberships m where m.organization_id = org and m.user_id = auth.uid()
   and (m.role = 'owner' or (m.role = 'admin' and invite_role = 'staff')))
$$;
revoke all on function private.can_invite(uuid,text) from public,anon,authenticated;

create function private.create_join_link(org uuid, invite_role text, name text, uses integer) returns text language plpgsql security definer set search_path = '' as $$
declare c text;
begin
 if invite_role not in ('admin','staff') or not private.can_invite(org, invite_role) then raise exception 'Not allowed' using errcode = '42501'; end if;
 if uses is null or uses not between 1 and 50 then raise exception 'Uses must be 1 to 50' using errcode = '22023'; end if;
 loop
  c := private.random_code(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
  exit when not exists (select 1 from private.join_links j where j.code = c);
 end loop;
 insert into private.join_links(code,organization_id,role,display_name,max_uses,created_by) values (c,org,invite_role,nullif(btrim(name),''),uses,auth.uid());
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values (org,auth.uid(),'join_links',org,'INSERT');
 return c;
end $$;

create function private.list_join_links(org uuid) returns table(code text, role text, display_name text, uses integer, max_uses integer, expires_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select j.code, j.role, j.display_name, j.uses, j.max_uses, j.expires_at, j.created_at from private.join_links j
 where j.organization_id = org and private.can_manage_org(org) and j.revoked_at is null and j.expires_at > now() and j.uses < j.max_uses
 order by j.created_at desc
$$;

create function private.revoke_join_link(org uuid, link text) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not private.can_manage_org(org) then raise exception 'Not allowed' using errcode = '42501'; end if;
 update private.join_links set revoked_at = now() where code = link and organization_id = org;
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values (org,auth.uid(),'join_links',org,'DELETE');
end $$;

-- What the join page shows before sign-up.
create function private.join_link_view(link text) returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('organization', o.name, 'type', o.type, 'role', j.role, 'display_name', j.display_name,
   'valid', j.revoked_at is null and j.expires_at > now() and j.uses < j.max_uses)
 from private.join_links j join public.organizations o on o.id = j.organization_id where j.code = upper(btrim(link))
$$;

-- Usernames sign in as <username>@users.seer.local; real emails sign in as themselves.
create function private.login_email(login text) returns text language plpgsql immutable set search_path = '' as $$
declare v text := lower(btrim(coalesce(login,'')));
begin
 if v ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(v) <= 254 then return v; end if;
 if v ~ '^[a-z0-9][a-z0-9._-]{2,29}$' then return v || '@users.seer.local'; end if;
 raise exception 'Choose a username of 3-30 letters or numbers, or an email' using errcode = '22023';
end $$;
revoke all on function private.login_email(text) from public,anon,authenticated;

-- Creates the account (already confirmed) and the membership. A signed-in person joins with their
-- current account instead. Returns the email to sign in with.
create function private.join_with_code(link text, login text, password text, name text) returns text language plpgsql security definer set search_path = '' as $$
declare j private.join_links%rowtype; addr text; uid uuid := auth.uid();
begin
 select * into j from private.join_links x where x.code = upper(btrim(link)) for update;
 if not found or j.revoked_at is not null or j.expires_at <= now() or j.uses >= j.max_uses then raise exception 'This link is no longer valid' using errcode = 'P0002'; end if;
 if uid is null then
  addr := private.login_email(login);
  if length(coalesce(password,'')) < 8 or password !~ '[0-9]' or password !~ '[^0-9]' then raise exception 'Password needs 8+ characters with letters and numbers' using errcode = '22023'; end if;
  if exists (select 1 from auth.users u where lower(u.email) = addr) then raise exception 'This username or email is taken' using errcode = '23505'; end if;
  uid := gen_random_uuid();
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
  values ('00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated',addr,private.hash_password(password),now(),
          '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('joined_with','link'),now(),now(),'','','','');
  insert into auth.identities(provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
  values (uid::text,uid,jsonb_build_object('sub',uid::text,'email',addr,'email_verified',true),'email',now(),now(),now());
 else
  select u.email into addr from auth.users u where u.id = uid;
  if exists (select 1 from public.memberships m where m.organization_id = j.organization_id and m.user_id = uid) then raise exception 'You are already a member' using errcode = '23505'; end if;
 end if;
 insert into public.memberships(organization_id,user_id,role,display_name) values (j.organization_id,uid,j.role,coalesce(nullif(btrim(name),''),j.display_name));
 update private.join_links set uses = uses + 1 where code = j.code;
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values (j.organization_id,uid,'memberships',uid,'INSERT');
 return addr;
end $$;

-- 2) Password reset by a manager ------------------------------------------------------------------
create function private.reset_member_password(org uuid, member uuid, password text) returns void language plpgsql security definer set search_path = '' as $$
declare target text; mine text;
begin
 select m.role into mine from public.memberships m where m.organization_id = org and m.user_id = auth.uid();
 select m.role into target from public.memberships m where m.organization_id = org and m.user_id = member;
 if target is null or member = auth.uid() or not ((mine = 'owner' and target <> 'owner') or (mine = 'admin' and target = 'staff')) then
  raise exception 'Not allowed' using errcode = '42501';
 end if;
 if length(coalesce(password,'')) < 8 or password !~ '[0-9]' or password !~ '[^0-9]' then raise exception 'Password needs 8+ characters with letters and numbers' using errcode = '22023'; end if;
 update auth.users set encrypted_password = private.hash_password(password), updated_at = now() where id = member;
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values (org,auth.uid(),'member_password',member,'UPDATE');
end $$;

-- The sign-in name managers see for each member (username or email), to tell staff how to log in.
create function private.member_logins(org uuid) returns table(user_id uuid, login text) language sql stable security definer set search_path = '' as $$
 select m.user_id, case when u.email like '%@users.seer.local' then split_part(u.email,'@',1) else u.email end
 from public.memberships m join auth.users u on u.id = m.user_id where m.organization_id = org and private.can_manage_org(org)
$$;

revoke all on function private.create_join_link(uuid,text,text,integer), private.list_join_links(uuid), private.revoke_join_link(uuid,text),
 private.join_link_view(text), private.join_with_code(text,text,text,text), private.reset_member_password(uuid,uuid,text), private.member_logins(uuid) from public,anon,authenticated;
grant execute on function private.create_join_link(uuid,text,text,integer), private.list_join_links(uuid), private.revoke_join_link(uuid,text),
 private.reset_member_password(uuid,uuid,text), private.member_logins(uuid) to authenticated;
grant execute on function private.join_link_view(text), private.join_with_code(text,text,text,text) to anon, authenticated;

create function public.create_join_link(org uuid, invite_role text, name text default null, uses integer default 1) returns text language sql set search_path = '' as $$ select private.create_join_link(org, invite_role, name, uses) $$;
create function public.list_join_links(org uuid) returns table(code text, role text, display_name text, uses integer, max_uses integer, expires_at timestamptz, created_at timestamptz) language sql stable set search_path = '' as $$ select * from private.list_join_links(org) $$;
create function public.revoke_join_link(org uuid, link text) returns void language sql set search_path = '' as $$ select private.revoke_join_link(org, link) $$;
create function public.join_link_view(link text) returns jsonb language sql stable set search_path = '' as $$ select private.join_link_view(link) $$;
create function public.join_with_code(link text, login text default null, password text default null, name text default null) returns text language sql set search_path = '' as $$ select private.join_with_code(link, login, password, name) $$;
create function public.reset_member_password(org uuid, member uuid, password text) returns void language sql set search_path = '' as $$ select private.reset_member_password(org, member, password) $$;
create function public.member_logins(org uuid) returns table(user_id uuid, login text) language sql stable set search_path = '' as $$ select * from private.member_logins(org) $$;
revoke all on function public.create_join_link(uuid,text,text,integer), public.list_join_links(uuid), public.revoke_join_link(uuid,text),
 public.join_link_view(text), public.join_with_code(text,text,text,text), public.reset_member_password(uuid,uuid,text), public.member_logins(uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_join_link(uuid,text,text,integer), public.list_join_links(uuid), public.revoke_join_link(uuid,text),
 public.reset_member_password(uuid,uuid,text), public.member_logins(uuid) to authenticated;
grant execute on function public.join_link_view(text), public.join_with_code(text,text,text,text) to anon, authenticated;

-- 3) Short links -----------------------------------------------------------------------------------
create table private.short_links (
 code text primary key check (code ~ '^[A-Za-z0-9]{10}$'),
 path text not null unique check (path ~ '^/(d|p|c)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
 created_at timestamptz not null default now()
);
alter table private.short_links enable row level security;
revoke all on private.short_links from public,anon,authenticated;

create function private.short_code(target text) returns text language plpgsql security definer set search_path = '' as $$
declare c text;
begin
 if target !~ '^/(d|p|c)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Not a shareable path' using errcode = '22023'; end if;
 select s.code into c from private.short_links s where s.path = target;
 if c is not null then return c; end if;
 loop
  c := private.random_code(10, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789');
  exit when not exists (select 1 from private.short_links s where s.code = c);
 end loop;
 insert into private.short_links(code,path) values (c,target) on conflict (path) do nothing;
 select s.code into c from private.short_links s where s.path = target;
 return c;
end $$;
create function private.resolve_short(link text) returns text language sql stable security definer set search_path = '' as $$
 select s.path from private.short_links s where s.code = link
$$;
revoke all on function private.short_code(text), private.resolve_short(text) from public,anon,authenticated;
grant execute on function private.short_code(text) to authenticated;
grant execute on function private.resolve_short(text) to anon, authenticated;
create function public.short_code(target text) returns text language sql set search_path = '' as $$ select private.short_code(target) $$;
create function public.resolve_short(link text) returns text language sql stable set search_path = '' as $$ select private.resolve_short(link) $$;
revoke all on function public.short_code(text), public.resolve_short(text) from public,anon,authenticated,service_role;
grant execute on function public.short_code(text) to authenticated;
grant execute on function public.resolve_short(text) to anon, authenticated;

-- Messages are shortened as they are queued: every https://host/(d|p|c)/<uuid> becomes https://host/s/CODE.
create function private.shorten_message() returns trigger language plpgsql security definer set search_path = '' as $$
declare m text[];
begin
 for m in select regexp_matches(new.body, '(https://[A-Za-z0-9.:-]+)(/(?:d|p|c)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g') loop
  new.body := replace(new.body, m[1] || m[2], m[1] || '/s/' || private.short_code(m[2]));
 end loop;
 return new;
end $$;
revoke all on function private.shorten_message() from public,anon,authenticated;
create trigger shorten_message before insert or update of body on public.message_outbox for each row execute function private.shorten_message();
commit;
