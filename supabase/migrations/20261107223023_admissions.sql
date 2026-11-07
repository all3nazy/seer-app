-- Admissions: a public application form per organization, a manager-only review pipeline,
-- a status lookup for families by reference and phone, and conversion into a student file.
-- Forward-only; apply once after review. Applications hold family contact details, so only
-- managers read them. The public can submit only through a guarded function, never the table.
begin;

-- Whether an organization accepts online applications, and the note shown on its form.
create table public.admission_settings (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 is_open boolean not null default false,
 intro text check (intro is null or length(intro) <= 1000),
 daily_limit integer not null default 100 check (daily_limit between 1 and 1000)
);

create table public.applications (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 reference text not null unique check (reference ~ '^[A-HJ-NP-Z2-9]{8}$'),
 child_name text not null check (length(btrim(child_name)) between 1 and 120),
 child_birth_date date,
 child_gender text check (child_gender is null or child_gender in ('male','female')),
 grade_level_id uuid,
 guardian_name text not null check (length(btrim(guardian_name)) between 1 and 120),
 guardian_phone text not null check (guardian_phone ~ '^\+?[0-9]{8,15}$'),
 guardian_email text check (guardian_email is null or (length(guardian_email) between 3 and 254 and guardian_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
 relationship text not null default 'guardian' check (relationship in ('father','mother','guardian','other')),
 family_notes text check (family_notes is null or length(family_notes) <= 1000),
 status text not null default 'new' check (status in ('new','reviewing','interview','waitlisted','accepted','rejected','enrolled','withdrawn')),
 interview_at timestamptz,
 staff_notes text check (staff_notes is null or length(staff_notes) <= 2000),
 child_id uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint applications_grade_fkey foreign key (grade_level_id,organization_id) references public.grade_levels(id,organization_id) on delete set null (grade_level_id),
 constraint applications_child_fkey foreign key (child_id,organization_id) references public.children(id,organization_id) on delete set null (child_id)
);
create index applications_org_status_idx on public.applications(organization_id,status,created_at desc);
create index applications_org_created_idx on public.applications(organization_id,created_at);

alter table public.admission_settings enable row level security;
alter table public.applications enable row level security;
revoke all on public.admission_settings,public.applications from public,anon,authenticated;
grant select on public.admission_settings to authenticated;
grant insert(organization_id,is_open,intro,daily_limit), update(is_open,intro,daily_limit) on public.admission_settings to authenticated;
create policy admission_settings_read on public.admission_settings for select to authenticated using(private.is_org_member(organization_id));
create policy admission_settings_insert on public.admission_settings for insert to authenticated with check(private.can_manage_org(organization_id));
create policy admission_settings_update on public.admission_settings for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id));

-- Managers review and update; nobody inserts directly; only withdrawn or rejected ones are deleted.
grant select,delete on public.applications to authenticated;
grant update(grade_level_id,status,interview_at,staff_notes,child_id) on public.applications to authenticated;
create policy applications_read on public.applications for select to authenticated using(private.can_manage_org(organization_id));
create policy applications_update on public.applications for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id));
create policy applications_delete on public.applications for delete to authenticated using(private.can_manage_org(organization_id) and status in ('rejected','withdrawn'));

create function private.touch_application() returns trigger language plpgsql set search_path = '' as $$
begin
 -- Enrolment happens only through conversion, which also records the child.
 if new.status = 'enrolled' and new.child_id is null then
  raise exception 'Convert the application to enrol it' using errcode = '23514';
 end if;
 new.updated_at := now();
 return new;
end $$;
revoke all on function private.touch_application() from public,anon,authenticated;
create trigger touch_application before update on public.applications for each row execute function private.touch_application();
create trigger keep_record_tenant before update on public.applications for each row execute function private.keep_record_tenant();
create trigger audit_operation after insert or update or delete on public.applications for each row execute function private.audit_operation();
create function private.audit_admission_settings() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values(new.organization_id,auth.uid(),'admission_settings',new.organization_id,TG_OP);
 return new;
end $$;
revoke all on function private.audit_admission_settings() from public,anon,authenticated;
create trigger audit_admission_settings after insert or update on public.admission_settings for each row execute function private.audit_admission_settings();

-- Public form data: the organization's name, its open grades and its note. Nothing else.
create function private.admission_form(org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare settings public.admission_settings%rowtype;
begin
 select * into settings from public.admission_settings s where s.organization_id = org and s.is_open;
 if not found then return null; end if;
 return jsonb_build_object(
  'name', (select o.name from public.organizations o where o.id = org),
  'intro', settings.intro,
  'grades', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.sort_order, g.name)
                      from public.grade_levels g where g.organization_id = org), '[]'::jsonb));
end $$;

create function private.submit_application(org uuid, payload jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
 settings public.admission_settings%rowtype;
 ref text;
 alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
 grade uuid := nullif(payload->>'grade_level_id','')::uuid;
 attempt integer;
begin
 select * into settings from public.admission_settings s where s.organization_id = org and s.is_open for share;
 if not found then raise exception 'Admissions are closed' using errcode = '42501'; end if;
 -- A per-organization daily ceiling limits abuse of the public form.
 if (select count(*) from public.applications a where a.organization_id = org and a.created_at > now() - interval '1 day') >= settings.daily_limit then
  raise exception 'Too many applications today' using errcode = '54000';
 end if;
 if grade is not null and not exists(select 1 from public.grade_levels g where g.id = grade and g.organization_id = org) then
  raise exception 'Unknown grade' using errcode = '23503';
 end if;
 for attempt in 1..5 loop
  ref := (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '') from generate_series(1,8));
  begin
   insert into public.applications(organization_id,reference,child_name,child_birth_date,child_gender,grade_level_id,guardian_name,guardian_phone,guardian_email,relationship,family_notes)
   values(org, ref, btrim(payload->>'child_name'), nullif(payload->>'child_birth_date','')::date, nullif(payload->>'child_gender',''), grade,
          btrim(payload->>'guardian_name'), btrim(payload->>'guardian_phone'), nullif(lower(btrim(coalesce(payload->>'guardian_email',''))),''),
          coalesce(nullif(payload->>'relationship',''),'guardian'), nullif(btrim(coalesce(payload->>'family_notes','')),''));
   return ref;
  exception when unique_violation then
   if attempt = 5 then raise; end if;
  end;
 end loop;
 return null;
end $$;

-- Families check progress with the reference and the phone they applied with. Only the status
-- and interview time are revealed, and an unknown pair is indistinguishable from a wrong one.
create function private.application_status(ref text, phone text)
returns table(status text, interview_at timestamptz, organization_name text)
language sql stable security definer set search_path = '' as $$
 select a.status, a.interview_at, o.name from public.applications a join public.organizations o on o.id = a.organization_id
 where a.reference = upper(btrim(ref)) and a.guardian_phone = btrim(phone)
$$;

-- Manager-only conversion: creates the child, guardian, family link and an approved enrolment,
-- optionally placing the child in a section, all in one transaction under the caller's RLS.
create function public.convert_application(application uuid, section uuid default null) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
 app public.applications%rowtype;
 new_child uuid;
 new_guardian uuid;
begin
 select * into app from public.applications a where a.id = application for update;
 if not found or not private.can_manage_org(app.organization_id) then raise exception 'Application not found' using errcode = 'P0002'; end if;
 if app.child_id is not null then raise exception 'Already converted' using errcode = '23505'; end if;
 if app.status not in ('accepted','waitlisted','interview','reviewing','new') then raise exception 'This application cannot be enrolled' using errcode = '23514'; end if;
 insert into public.children(organization_id,full_name,date_of_birth,gender,section_id)
  values(app.organization_id, app.child_name, app.child_birth_date, app.child_gender, section) returning id into new_child;
 select g.id into new_guardian from public.guardians g where g.organization_id = app.organization_id and g.phone = app.guardian_phone limit 1;
 if new_guardian is null then
  insert into public.guardians(organization_id,full_name,phone,email) values(app.organization_id, app.guardian_name, app.guardian_phone, app.guardian_email) returning id into new_guardian;
 end if;
 insert into public.child_guardians(organization_id,child_id,guardian_id,relationship) values(app.organization_id,new_child,new_guardian,app.relationship);
 insert into public.enrollments(organization_id,child_id,status) values(app.organization_id,new_child,'approved');
 update public.applications set child_id = new_child, status = 'enrolled' where id = application;
 return new_child;
end $$;

revoke all on function private.admission_form(uuid),private.submit_application(uuid,jsonb),private.application_status(text,text) from public,anon,authenticated,service_role;
grant execute on function private.admission_form(uuid),private.submit_application(uuid,jsonb),private.application_status(text,text) to anon,authenticated;
grant usage on schema private to anon;
create function public.admission_form(org uuid) returns jsonb language sql stable security invoker set search_path = '' as $$ select private.admission_form(org) $$;
create function public.submit_application(org uuid, payload jsonb) returns text language sql security invoker set search_path = '' as $$ select private.submit_application(org, payload) $$;
create function public.application_status(ref text, phone text) returns table(status text, interview_at timestamptz, organization_name text)
 language sql stable security invoker set search_path = '' as $$ select * from private.application_status(ref, phone) $$;
revoke all on function public.admission_form(uuid),public.submit_application(uuid,jsonb),public.application_status(text,text),public.convert_application(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admission_form(uuid),public.submit_application(uuid,jsonb),public.application_status(text,text) to anon,authenticated;
grant execute on function public.convert_application(uuid,uuid) to authenticated;
revoke truncate,references,trigger on public.admission_settings,public.applications from anon,authenticated;
commit;
