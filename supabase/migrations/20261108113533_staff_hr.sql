-- Staff: employee files with contracts and pay, leave requests with approval, daily staff
-- attendance (with self check-in), and monthly payroll computed by the database.
-- Pay data is manager-only; an employee linked to a member account sees and requests only their own.
-- Forward-only; adds tables and functions and changes no existing data.
begin;

create table public.staff_profiles (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid references auth.users(id) on delete set null,
 full_name text not null check (length(btrim(full_name)) between 1 and 120),
 job_title text check (job_title is null or length(btrim(job_title)) between 1 and 80),
 national_id text check (national_id is null or national_id ~ '^[12][0-9]{9}$'),
 nationality text check (nationality is null or length(btrim(nationality)) between 1 and 40),
 phone text check (phone is null or phone ~ '^\+?[0-9]{8,15}$'),
 hire_date date,
 contract_type text not null default 'full_time' check (contract_type in ('full_time','part_time','fixed_term','hourly')),
 contract_end date,
 basic_salary numeric(12,2) not null default 0 check (basic_salary >= 0),
 housing_allowance numeric(12,2) not null default 0 check (housing_allowance >= 0),
 transport_allowance numeric(12,2) not null default 0 check (transport_allowance >= 0),
 other_allowance numeric(12,2) not null default 0 check (other_allowance >= 0),
 gosi_rate numeric(5,2) not null default 0 check (gosi_rate between 0 and 25),
 annual_leave_days integer not null default 21 check (annual_leave_days between 0 and 60),
 iban text check (iban is null or iban ~ '^SA[0-9]{22}$'),
 status text not null default 'active' check (status in ('active','left')),
 notes text check (notes is null or length(notes) <= 1000),
 created_at timestamptz not null default now(),
 constraint staff_profiles_id_organization_id_key unique (id,organization_id),
 constraint staff_profiles_contract_end check (contract_end is null or hire_date is null or contract_end >= hire_date),
 constraint staff_profiles_member_fkey foreign key (organization_id,user_id) references public.memberships(organization_id,user_id) on delete set null (user_id)
);
create unique index staff_profiles_one_per_member on public.staff_profiles(organization_id,user_id) where user_id is not null;

create table public.leave_requests (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 staff_id uuid not null,
 kind text not null check (kind in ('annual','sick','emergency','unpaid','other')),
 starts_on date not null,
 ends_on date not null,
 days integer not null default 0,
 reason text check (reason is null or length(reason) <= 500),
 status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
 requested_by uuid references auth.users(id) on delete set null,
 decided_by uuid references auth.users(id) on delete set null,
 decided_at timestamptz,
 created_at timestamptz not null default now(),
 constraint leave_requests_dates check (ends_on >= starts_on and ends_on - starts_on <= 120),
 constraint leave_requests_staff_fkey foreign key (staff_id,organization_id) references public.staff_profiles(id,organization_id) on delete cascade
);
create index leave_requests_org_idx on public.leave_requests(organization_id,starts_on desc);

create table public.staff_attendance (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 staff_id uuid not null,
 work_date date not null,
 status text not null default 'present' check (status in ('present','late','absent','leave')),
 check_in timestamptz,
 check_out timestamptz,
 note text check (note is null or length(note) <= 200),
 recorded_by uuid references auth.users(id) on delete set null,
 constraint staff_attendance_one_per_day unique (organization_id,staff_id,work_date),
 constraint staff_attendance_times check (check_out is null or check_in is null or check_out >= check_in),
 constraint staff_attendance_staff_fkey foreign key (staff_id,organization_id) references public.staff_profiles(id,organization_id) on delete cascade
);
create index staff_attendance_org_date_idx on public.staff_attendance(organization_id,work_date);

create table public.payroll_runs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 period date not null check (extract(day from period) = 1),
 status text not null default 'draft' check (status in ('draft','approved')),
 total_gross numeric(14,2) not null default 0,
 total_deductions numeric(14,2) not null default 0,
 total_net numeric(14,2) not null default 0,
 created_by uuid references auth.users(id) on delete set null,
 approved_by uuid references auth.users(id) on delete set null,
 approved_at timestamptz,
 created_at timestamptz not null default now(),
 constraint payroll_runs_id_organization_id_key unique (id,organization_id),
 constraint payroll_runs_one_per_month unique (organization_id,period)
);
create table public.payroll_lines (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 run_id uuid not null,
 staff_id uuid,
 full_name text not null,
 job_title text,
 iban text,
 basic numeric(12,2) not null default 0,
 allowances numeric(12,2) not null default 0,
 unpaid_days integer not null default 0,
 absence_days integer not null default 0,
 absence_deduction numeric(12,2) not null default 0,
 gosi_deduction numeric(12,2) not null default 0,
 other_deduction numeric(12,2) not null default 0 check (other_deduction >= 0),
 bonus numeric(12,2) not null default 0 check (bonus >= 0),
 net numeric(12,2) not null default 0,
 constraint payroll_lines_run_fkey foreign key (run_id,organization_id) references public.payroll_runs(id,organization_id) on delete cascade,
 constraint payroll_lines_staff_fkey foreign key (staff_id,organization_id) references public.staff_profiles(id,organization_id) on delete set null (staff_id)
);
create index payroll_lines_run_idx on public.payroll_lines(run_id);

-- Leave: the requester and day count come from the database; staff request only for their own
-- file and only pending; managers decide. Approved leave marks attendance as leave.
create function private.guard_leave() returns trigger language plpgsql security definer set search_path = '' as $$
declare manager boolean := private.can_manage_org(new.organization_id);
begin
 new.days := new.ends_on - new.starts_on + 1;
 if TG_OP = 'INSERT' then
  new.requested_by := auth.uid(); new.created_at := now(); new.decided_by := null; new.decided_at := null;
  if not manager then
   if not exists(select 1 from public.staff_profiles s where s.id = new.staff_id and s.user_id = auth.uid()) then
    raise exception 'Request leave for your own file' using errcode = '42501';
   end if;
   new.status := 'pending';
  end if;
 else
  if (new.staff_id, new.organization_id) is distinct from (old.staff_id, old.organization_id) then raise exception 'Leave cannot move' using errcode = '42501'; end if;
  new.requested_by := old.requested_by; new.created_at := old.created_at;
  if not manager then
   if not (old.status = 'pending' and new.status = 'cancelled' and old.requested_by = auth.uid()) then
    raise exception 'Only managers decide leave' using errcode = '42501';
   end if;
  end if;
  if new.status is distinct from old.status and new.status in ('approved','rejected') then new.decided_by := auth.uid(); new.decided_at := now(); end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_leave() from public,anon,authenticated;
create function private.after_leave() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status = 'approved' and (TG_OP = 'INSERT' or old.status is distinct from 'approved') then
  insert into public.staff_attendance(organization_id,staff_id,work_date,status,note)
  select new.organization_id,new.staff_id,d::date,'leave','إجازة معتمدة' from generate_series(new.starts_on,new.ends_on,interval '1 day') d
  on conflict (organization_id,staff_id,work_date) do update set status = 'leave', note = 'إجازة معتمدة';
 end if;
 return null;
end $$;
revoke all on function private.after_leave() from public,anon,authenticated;
create trigger guard_leave before insert or update on public.leave_requests for each row execute function private.guard_leave();
create trigger after_leave after insert or update on public.leave_requests for each row execute function private.after_leave();

-- Staff attendance: managers record any day; an employee may check themselves in and out today only.
create function private.guard_staff_attendance() returns trigger language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Riyadh')::date;
begin
 if auth.uid() is not null and not private.can_manage_org(new.organization_id) then
  if not exists(select 1 from public.staff_profiles s where s.id = new.staff_id and s.user_id = auth.uid()) or new.work_date <> today then
   raise exception 'Check in for yourself, today only' using errcode = '42501';
  end if;
  if TG_OP = 'INSERT' then new.check_in := now(); new.check_out := null; new.status := 'present';
  else
   new.check_in := old.check_in; new.status := old.status; new.note := old.note;
   if old.check_out is not null then raise exception 'Already checked out' using errcode = '23514'; end if;
   new.check_out := now();
  end if;
 end if;
 if TG_OP = 'UPDATE' and (new.staff_id, new.work_date) is distinct from (old.staff_id, old.work_date) then raise exception 'Attendance identity cannot change' using errcode = '42501'; end if;
 if new.work_date > today then raise exception 'Attendance cannot be recorded for a future day' using errcode = '23514'; end if;
 new.recorded_by := coalesce(auth.uid(), new.recorded_by);
 return new;
end $$;
revoke all on function private.guard_staff_attendance() from public,anon,authenticated;
create trigger guard_staff_attendance before insert or update on public.staff_attendance for each row execute function private.guard_staff_attendance();

-- Payroll lines are computed; an approved run is frozen.
create function private.guard_payroll_line() returns trigger language plpgsql security definer set search_path = '' as $$
declare state text; daily numeric;
begin
 select r.status into state from public.payroll_runs r where r.id = case when TG_OP = 'DELETE' then old.run_id else new.run_id end;
 if state = 'approved' and auth.uid() is not null then raise exception 'Approved payroll cannot change' using errcode = '42501'; end if;
 if TG_OP = 'DELETE' then return old; end if;
 if TG_OP = 'UPDATE' then
  new.full_name := old.full_name; new.job_title := old.job_title; new.iban := old.iban; new.basic := old.basic; new.allowances := old.allowances;
  new.unpaid_days := old.unpaid_days; new.absence_days := old.absence_days; new.gosi_deduction := old.gosi_deduction; new.staff_id := old.staff_id; new.run_id := old.run_id;
 end if;
 daily := round((new.basic + new.allowances) / 30, 2);
 new.absence_deduction := least(new.basic + new.allowances, round(daily * (new.unpaid_days + new.absence_days), 2));
 new.net := greatest(0, new.basic + new.allowances + new.bonus - new.absence_deduction - new.gosi_deduction - new.other_deduction);
 return new;
end $$;
revoke all on function private.guard_payroll_line() from public,anon,authenticated;
create function private.after_payroll_line() returns trigger language plpgsql security definer set search_path = '' as $$
declare target uuid := case when TG_OP = 'DELETE' then old.run_id else new.run_id end;
begin
 perform set_config('seer.payroll_sync', 'on', true);
 update public.payroll_runs r set total_gross = t.gross, total_deductions = t.deductions, total_net = t.net
 from (select coalesce(sum(l.basic + l.allowances + l.bonus),0) gross, coalesce(sum(l.absence_deduction + l.gosi_deduction + l.other_deduction),0) deductions, coalesce(sum(l.net),0) net
       from public.payroll_lines l where l.run_id = target) t where r.id = target;
 perform set_config('seer.payroll_sync', 'off', true);
 return null;
end $$;
revoke all on function private.after_payroll_line() from public,anon,authenticated;
create function private.guard_payroll_run() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if TG_OP = 'INSERT' then
  new.status := 'draft'; new.total_gross := 0; new.total_deductions := 0; new.total_net := 0; new.created_by := auth.uid(); new.created_at := now(); new.approved_by := null; new.approved_at := null;
  return new;
 end if;
 if coalesce(current_setting('seer.payroll_sync', true), '') <> 'on' then
  new.total_gross := old.total_gross; new.total_deductions := old.total_deductions; new.total_net := old.total_net;
 end if;
 new.period := old.period; new.created_by := old.created_by; new.created_at := old.created_at;
 if old.status = 'approved' and auth.uid() is not null and new.status <> 'approved' then raise exception 'Approved payroll stays approved' using errcode = '42501'; end if;
 if new.status = 'approved' and old.status = 'draft' then new.approved_by := auth.uid(); new.approved_at := now();
 else new.approved_by := old.approved_by; new.approved_at := old.approved_at; end if;
 return new;
end $$;
revoke all on function private.guard_payroll_run() from public,anon,authenticated;
create trigger guard_payroll_run before insert or update on public.payroll_runs for each row execute function private.guard_payroll_run();
create trigger guard_payroll_line before insert or update or delete on public.payroll_lines for each row execute function private.guard_payroll_line();
create trigger after_payroll_line after insert or update or delete on public.payroll_lines for each row execute function private.after_payroll_line();

-- Build (or rebuild) a month's draft payroll from active staff: monthly pay, approved unpaid
-- leave days and recorded absences in that month, and the employee's GOSI share.
create function public.generate_payroll(org uuid, month date) returns uuid language plpgsql security invoker set search_path = '' as $$
declare run uuid; first_day date := date_trunc('month', month)::date; last_day date := (date_trunc('month', month) + interval '1 month - 1 day')::date;
begin
 if not private.can_manage_org(org) then raise exception 'Managers only' using errcode = '42501'; end if;
 select r.id into run from public.payroll_runs r where r.organization_id = org and r.period = first_day;
 if run is null then insert into public.payroll_runs(organization_id,period) values (org,first_day) returning id into run;
 elsif exists(select 1 from public.payroll_runs r where r.id = run and r.status = 'approved') then raise exception 'This month is already approved' using errcode = '23514';
 else delete from public.payroll_lines l where l.run_id = run; end if;
 insert into public.payroll_lines(organization_id,run_id,staff_id,full_name,job_title,iban,basic,allowances,unpaid_days,absence_days,gosi_deduction)
 select org, run, s.id, s.full_name, s.job_title, s.iban, s.basic_salary, s.housing_allowance + s.transport_allowance + s.other_allowance,
  coalesce((select sum(least(l.ends_on,last_day) - greatest(l.starts_on,first_day) + 1) from public.leave_requests l
            where l.staff_id = s.id and l.status = 'approved' and l.kind = 'unpaid' and l.starts_on <= last_day and l.ends_on >= first_day),0)::integer,
  (select count(*) from public.staff_attendance a where a.staff_id = s.id and a.status = 'absent' and a.work_date between first_day and last_day)::integer,
  round((s.basic_salary + s.housing_allowance) * s.gosi_rate / 100, 2)
 from public.staff_profiles s where s.organization_id = org and s.status = 'active' and (s.hire_date is null or s.hire_date <= last_day);
 return run;
end $$;
revoke all on function public.generate_payroll(uuid,date) from public,anon,authenticated,service_role;
grant execute on function public.generate_payroll(uuid,date) to authenticated;

-- Access.
do $$
declare t text;
begin
 foreach t in array array['staff_profiles','leave_requests','staff_attendance','payroll_runs','payroll_lines'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from public,anon,authenticated', t);
  execute format('grant select on public.%I to authenticated', t);
  execute format('create trigger keep_record_tenant before update on public.%I for each row execute function private.keep_record_tenant()', t);
  execute format('create trigger audit_operation after insert or update or delete on public.%I for each row execute function private.audit_operation()', t);
  execute format('revoke truncate,references,trigger on public.%I from anon,authenticated', t);
 end loop;
end $$;
-- Files and pay: managers; an employee reads only their own file.
create policy staff_profiles_read on public.staff_profiles for select to authenticated using(private.can_manage_org(organization_id) or user_id = auth.uid());
create policy staff_profiles_write on public.staff_profiles for insert to authenticated with check(private.can_manage_org(organization_id));
create policy staff_profiles_update on public.staff_profiles for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id));
create policy staff_profiles_delete on public.staff_profiles for delete to authenticated using(private.can_manage_org(organization_id));
grant insert(organization_id,user_id,full_name,job_title,national_id,nationality,phone,hire_date,contract_type,contract_end,basic_salary,housing_allowance,transport_allowance,other_allowance,gosi_rate,annual_leave_days,iban,status,notes),
 update(user_id,full_name,job_title,national_id,nationality,phone,hire_date,contract_type,contract_end,basic_salary,housing_allowance,transport_allowance,other_allowance,gosi_rate,annual_leave_days,iban,status,notes), delete on public.staff_profiles to authenticated;
-- Leave: own requests and managers.
create function private.is_own_staff(staff uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.staff_profiles s where s.id = staff and s.user_id = auth.uid())
$$;
revoke all on function private.is_own_staff(uuid) from public,anon,authenticated;
grant execute on function private.is_own_staff(uuid) to authenticated;
create policy leave_read on public.leave_requests for select to authenticated using(private.can_manage_org(organization_id) or private.is_own_staff(staff_id));
create policy leave_insert on public.leave_requests for insert to authenticated with check(private.can_manage_org(organization_id) or private.is_own_staff(staff_id));
create policy leave_update on public.leave_requests for update to authenticated using(private.can_manage_org(organization_id) or private.is_own_staff(staff_id)) with check(private.can_manage_org(organization_id) or private.is_own_staff(staff_id));
grant insert(organization_id,staff_id,kind,starts_on,ends_on,reason,status), update(kind,starts_on,ends_on,reason,status) on public.leave_requests to authenticated;
-- Staff attendance: own rows and managers.
create policy staff_attendance_read on public.staff_attendance for select to authenticated using(private.can_manage_org(organization_id) or private.is_own_staff(staff_id));
create policy staff_attendance_insert on public.staff_attendance for insert to authenticated with check(private.can_manage_org(organization_id) or private.is_own_staff(staff_id));
create policy staff_attendance_update on public.staff_attendance for update to authenticated using(private.can_manage_org(organization_id) or private.is_own_staff(staff_id)) with check(private.can_manage_org(organization_id) or private.is_own_staff(staff_id));
create policy staff_attendance_delete on public.staff_attendance for delete to authenticated using(private.can_manage_org(organization_id));
grant insert(organization_id,staff_id,work_date,status,check_in,check_out,note), update(status,check_in,check_out,note), delete on public.staff_attendance to authenticated;
-- Payroll: managers only.
create policy payroll_runs_read on public.payroll_runs for select to authenticated using(private.can_manage_org(organization_id));
create policy payroll_runs_insert on public.payroll_runs for insert to authenticated with check(private.can_manage_org(organization_id));
create policy payroll_runs_update on public.payroll_runs for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id));
create policy payroll_runs_delete on public.payroll_runs for delete to authenticated using(private.can_manage_org(organization_id) and status = 'draft');
grant insert(organization_id,period), update(status), delete on public.payroll_runs to authenticated;
create policy payroll_lines_read on public.payroll_lines for select to authenticated using(private.can_manage_org(organization_id));
create policy payroll_lines_insert on public.payroll_lines for insert to authenticated with check(private.can_manage_org(organization_id));
create policy payroll_lines_update on public.payroll_lines for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id));
create policy payroll_lines_delete on public.payroll_lines for delete to authenticated using(private.can_manage_org(organization_id));
grant insert(organization_id,run_id,staff_id,full_name,job_title,iban,basic,allowances,unpaid_days,absence_days,gosi_deduction,other_deduction,bonus),
 update(other_deduction,bonus), delete on public.payroll_lines to authenticated;
commit;
