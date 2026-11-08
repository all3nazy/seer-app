-- Push notifications without shared secrets in the app's environment.
-- The push keys are generated once by the app server and kept in the database (never readable by
-- clients). Each push is a one-time job: the database stores the payload under a random single-use
-- code and calls the app server with that code only; the server claims the job (code valid for a
-- few minutes, once) and sends the notification to the person's devices.
-- Forward-only.
begin;

create table private.push_keys (
 id boolean primary key default true check (id),
 public_key text not null check (length(public_key) between 40 and 200),
 private_key text not null check (length(private_key) between 20 and 200),
 created_at timestamptz not null default now()
);
create table private.push_bootstrap (token text primary key check (length(token) >= 32), created_at timestamptz not null default now());
create table private.push_jobs (nonce text primary key, payload jsonb not null, created_at timestamptz not null default now());
alter table private.push_keys enable row level security;
alter table private.push_bootstrap enable row level security;
alter table private.push_jobs enable row level security;
revoke all on private.push_keys, private.push_bootstrap, private.push_jobs from public,anon,authenticated;
alter table private.push_config alter column secret drop not null;

-- The app server stores its freshly generated keys once, with a single-use bootstrap token.
create function private.init_push_keys(token text, public_key text, private_key text) returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if exists (select 1 from private.push_keys) then return false; end if;
 delete from private.push_bootstrap b where b.token = init_push_keys.token and b.created_at > now() - interval '1 day';
 if not found then raise exception 'Invalid token' using errcode = '42501'; end if;
 insert into private.push_keys(public_key, private_key) values (init_push_keys.public_key, init_push_keys.private_key);
 return true;
end $$;
create function private.push_public_key() returns text language sql stable security definer set search_path = '' as $$
 select k.public_key from private.push_keys k
$$;
-- One claim per job, within five minutes; returns what the server needs to send it.
create function private.claim_push_job(nonce text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare job jsonb;
begin
 delete from private.push_jobs j where j.nonce = claim_push_job.nonce and j.created_at > now() - interval '5 minutes' returning j.payload into job;
 if job is null then return null; end if;
 return job || (select jsonb_build_object('public_key', k.public_key, 'private_key', k.private_key) from private.push_keys k);
end $$;
revoke all on function private.init_push_keys(text,text,text), private.push_public_key(), private.claim_push_job(text) from public,anon,authenticated;
grant execute on function private.init_push_keys(text,text,text), private.claim_push_job(text) to anon, authenticated;
grant execute on function private.push_public_key() to authenticated;
create function public.init_push_keys(token text, public_key text, private_key text) returns boolean language sql set search_path = '' as $$ select private.init_push_keys(token, public_key, private_key) $$;
create function public.push_public_key() returns text language sql stable set search_path = '' as $$ select private.push_public_key() $$;
create function public.claim_push_job(nonce text) returns jsonb language sql set search_path = '' as $$ select private.claim_push_job(nonce) $$;
revoke all on function public.init_push_keys(text,text,text), public.push_public_key(), public.claim_push_job(text) from public,anon,authenticated,service_role;
grant execute on function public.init_push_keys(text,text,text), public.claim_push_job(text) to anon, authenticated;
grant execute on function public.push_public_key() to authenticated;

create or replace function private.notify(org uuid, member uuid, kind text, title text, body text, url text) returns void language plpgsql security definer set search_path = '' as $$
declare target text; subs jsonb; code text;
begin
 if member is null or member = auth.uid() then return; end if;
 insert into public.notifications(organization_id,user_id,kind,title,body,url) values (org,member,kind,left(title,120),left(body,300),url);
 -- The push is best effort in its own block: if it fails, the in-app notification above is kept.
 begin
  select c.endpoint into target from private.push_config c limit 1;
  if target is null or not exists (select 1 from private.push_keys) then return; end if;
  select jsonb_agg(jsonb_build_object('endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)) into subs from public.push_subscriptions s where s.user_id = member;
  if subs is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return; end if;
  delete from private.push_jobs j where j.created_at < now() - interval '10 minutes';
  code := private.random_code(43, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789');
  insert into private.push_jobs(nonce, payload) values (code, jsonb_build_object('subscriptions',subs,'title',left(title,120),'body',left(body,300),'url',url));
  execute 'select net.http_post($1, $2, ''{}''::jsonb, $3, 5000)' using target, jsonb_build_object('nonce', code), '{"Content-Type":"application/json"}'::jsonb;
 exception when others then
  return;
 end;
end $$;
commit;
