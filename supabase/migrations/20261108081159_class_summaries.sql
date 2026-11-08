-- Read-only summaries for the classes dashboard. Counting happens in the database so results are
-- complete for any school size (the API returns at most 1,000 rows per request).
-- Both functions run as the caller (security invoker), so RLS limits them to the caller's tenant.
-- Forward-only; creates functions only and changes no data.
begin;
create function public.section_enrollment(org uuid)
returns table(section_id uuid, total bigint)
language sql stable security invoker set search_path = '' as $$
 select c.section_id, count(*) from public.children c where c.organization_id = org group by c.section_id
$$;

create function public.section_attendance_summary(org uuid, from_day date, to_day date)
returns table(section_id uuid, attendance_date date, status text, total bigint)
language plpgsql stable security invoker set search_path = '' as $$
begin
 if to_day < from_day or to_day - from_day > 62 then raise exception 'Choose up to 62 days' using errcode = '22023'; end if;
 return query
  select c.section_id, a.attendance_date, a.status, count(*)
  from public.attendance a
  join public.children c on c.id = a.child_id and c.organization_id = a.organization_id
  where a.organization_id = org and a.attendance_date between from_day and to_day
  group by c.section_id, a.attendance_date, a.status;
end $$;

revoke all on function public.section_enrollment(uuid), public.section_attendance_summary(uuid,date,date) from public, anon, authenticated, service_role;
grant execute on function public.section_enrollment(uuid), public.section_attendance_summary(uuid,date,date) to authenticated;
commit;
