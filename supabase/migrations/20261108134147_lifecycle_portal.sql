-- Student lifecycle, a fuller family portal, and messages that link families to it.
-- 1) Students have a status: active, withdrawn or graduated. Only active students are counted in
--    classes, invoiced by fee plans, or can get new attendance, pickups, daily reports and bus
--    stops; a withdrawn or graduated student keeps their history and leaves bus routes.
-- 2) The family portal adds grades, behaviour notes and the child's bus stop and times.
-- 3) The daily-report message carries each guardian's own portal link (created on first need).
-- 4) Managers can send an announcement to families by WhatsApp/SMS with their portal links.
-- Forward-only.
begin;

-- 1) Lifecycle -------------------------------------------------------------------------------------
alter table public.children add column status text not null default 'active' check (status in ('active','withdrawn','graduated'));
alter table public.children add column status_changed_at timestamptz;
create index children_org_status_idx on public.children(organization_id,status);

create function private.on_child_status() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status is distinct from old.status then
  new.status_changed_at := now();
  if new.status <> 'active' then delete from public.route_stops rs where rs.child_id = new.id and rs.organization_id = new.organization_id; end if;
 end if;
 return new;
end $$;
revoke all on function private.on_child_status() from public,anon,authenticated;
create trigger on_child_status before update of status on public.children for each row execute function private.on_child_status();

create function private.require_active_child() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if exists (select 1 from public.children c where c.id = new.child_id and c.status <> 'active') then
  raise exception 'Student is not active' using errcode = '22023';
 end if;
 return new;
end $$;
revoke all on function private.require_active_child() from public,anon,authenticated;
create trigger require_active_child before insert on public.attendance for each row execute function private.require_active_child();
create trigger require_active_child before insert on public.pickups for each row execute function private.require_active_child();
create trigger require_active_child before insert on public.daily_reports for each row execute function private.require_active_child();
create trigger require_active_child before insert on public.route_stops for each row execute function private.require_active_child();

create or replace function public.section_enrollment(org uuid)
returns table(section_id uuid, total bigint)
language sql stable security invoker set search_path = '' as $$
 select c.section_id, count(*) from public.children c where c.organization_id = org and c.status = 'active' group by c.section_id
$$;

create or replace function public.generate_plan_invoices(plan uuid, target_section uuid, target_grade uuid, first_due date,
  interval_months integer default 1, discount uuid default null, issue boolean default false)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
 p public.fee_plans%rowtype;
 d public.discounts%rowtype;
 kid record;
 item record;
 inv uuid;
 n integer;
 created integer := 0;
 share numeric(12,2);
 line_discount numeric(12,2);
 fixed_left numeric(12,2);
begin
 select * into p from public.fee_plans f where f.id = plan;
 if not found or not private.can_manage_org(p.organization_id) then raise exception 'Plan not found' using errcode = 'P0002'; end if;
 if (target_section is null) = (target_grade is null) then raise exception 'Choose a section or a grade' using errcode = '22023'; end if;
 if interval_months not between 1 and 6 then raise exception 'Interval must be 1 to 6 months' using errcode = '22023'; end if;
 if not exists(select 1 from public.fee_plan_items i where i.fee_plan_id = plan) then raise exception 'The plan has no items' using errcode = '23514'; end if;
 if discount is not null then
  select * into d from public.discounts x where x.id = discount and x.organization_id = p.organization_id and x.is_active;
  if not found then raise exception 'Discount not found' using errcode = '23503'; end if;
 end if;
 for kid in
  select c.id, (select cg.guardian_id from public.child_guardians cg where cg.child_id = c.id order by cg.relationship limit 1) as guardian_id
  from public.children c
  where c.organization_id = p.organization_id and c.status = 'active'
    and (target_section is null or c.section_id = target_section)
    and (target_grade is null or c.section_id in (select s.id from public.sections s where s.grade_level_id = target_grade and s.organization_id = p.organization_id))
 loop
  fixed_left := case when discount is not null and d.kind = 'fixed' then d.value else 0 end;
  for n in 1..p.installments loop
   insert into public.invoices(organization_id,guardian_id,child_id,amount_sar,status,due_date,title,vat_borne_by_state)
   values(p.organization_id, kid.guardian_id, kid.id, 0, 'draft', (first_due + make_interval(months => (n - 1) * interval_months))::date,
          case when p.installments > 1 then format('%s — القسط %s من %s', p.name, n, p.installments) else p.name end, false)
   returning id into inv;
   for item in select fi.name, fi.kind, fi.vat_rate, pi.amount, pi.fee_item_id from public.fee_plan_items pi join public.fee_items fi on fi.id = pi.fee_item_id where pi.fee_plan_id = plan order by fi.kind, fi.name loop
    share := case when n < p.installments then floor(item.amount * 100 / p.installments) / 100
                  else item.amount - (floor(item.amount * 100 / p.installments) / 100) * (p.installments - 1) end;
    line_discount := 0;
    if discount is not null and d.kind = 'percent' then line_discount := round(share * d.value / 100, 2);
    elsif fixed_left > 0 then line_discount := least(fixed_left, share); fixed_left := fixed_left - line_discount;
    end if;
    insert into public.invoice_lines(organization_id,invoice_id,fee_item_id,description,kind,quantity,unit_price,discount,vat_rate)
    values(p.organization_id, inv, item.fee_item_id, item.name, item.kind, 1, share, line_discount, item.vat_rate);
   end loop;
   if issue then update public.invoices set status = 'issued' where id = inv and amount_sar > 0; end if;
   created := created + 1;
  end loop;
 end loop;
 return created;
end $$;

-- 2) Family portal ---------------------------------------------------------------------------------
create or replace function private.family_portal(token uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g public.guardians%rowtype; org uuid; today date := (now() at time zone 'Asia/Riyadh')::date; kids uuid[];
begin
 if token is null then return null; end if;
 select gd.* into g from private.guardian_portals p join public.guardians gd on gd.id = p.guardian_id where p.token = family_portal.token;
 if not found then return null; end if;
 org := g.organization_id;
 select coalesce(array_agg(cg.child_id), '{}') into kids from public.child_guardians cg where cg.guardian_id = g.id and cg.organization_id = org;
 return jsonb_build_object(
  'guardian', g.full_name,
  'organization', (select jsonb_build_object('name',o.name,'type',o.type,'legal_name',p.legal_name,'phone',p.phone,'brand_color',coalesce(p.brand_color,'#3E1657'),'logo_data',p.logo_data)
     from public.organizations o left join public.organization_profiles p on p.organization_id = o.id where o.id = org),
  'children', coalesce((select jsonb_agg(jsonb_build_object(
     'name', c.full_name,
     'section', (select concat_ws(' — ', gl.name, s.name) from public.sections s left join public.grade_levels gl on gl.id = s.grade_level_id where s.id = c.section_id),
     'today', (select a.status from public.attendance a where a.child_id = c.id and a.attendance_date = today),
     'picked_up', (select jsonb_build_object('by',pk.picked_by_name,'at',pk.picked_at) from public.pickups pk where pk.child_id = c.id and pk.pickup_date = today),
     'attendance', (select jsonb_build_object('present',count(*) filter (where a.status='present'),'late',count(*) filter (where a.status='late'),'absent',count(*) filter (where a.status='absent'),'excused',count(*) filter (where a.status='excused'))
        from public.attendance a where a.child_id = c.id and a.attendance_date > today - 30),
     'reports', coalesce((select jsonb_agg(jsonb_build_object('date',r.report_date,'mood',r.mood,'breakfast',r.breakfast,'lunch',r.lunch,'snack',r.snack,'nap_minutes',r.nap_minutes,'diapers',r.diapers,'activities',r.activities,'medication',r.medication,'incident',r.incident,'notes',r.notes) order by r.report_date desc)
        from (select * from public.daily_reports r0 where r0.child_id = c.id order by r0.report_date desc limit 14) r), '[]'),
     'pickup_people', coalesce((select jsonb_agg(jsonb_build_object('name',ap.full_name,'relationship',ap.relationship)) from public.authorized_pickups ap where ap.child_id = c.id and ap.is_active), '[]'),
     'status', c.status,
     'grades', coalesce((select jsonb_agg(jsonb_build_object('subject',x.subject,'title',x.title,'kind',x.kind,'score',x.score,'max',x.max_score,'absent',x.absent,'date',x.at) order by x.at desc)
        from (select su.name as subject, asm.title, asm.kind, gr.score, asm.max_score, gr.absent, coalesce(asm.due_date, gr.graded_at::date) as at
              from public.grades gr join public.assessments asm on asm.id = gr.assessment_id join public.subjects su on su.id = asm.subject_id
              where gr.child_id = c.id order by coalesce(asm.due_date, gr.graded_at::date) desc limit 20) x), '[]'),
     'behavior', coalesce((select jsonb_agg(jsonb_build_object('kind',b.kind,'category',b.category,'note',b.note,'points',b.points,'at',b.created_at) order by b.created_at desc)
        from (select * from public.behavior_notes b0 where b0.child_id = c.id order by b0.created_at desc limit 10) b), '[]'),
     'bus_stop', (select jsonb_build_object('route',br.name,'stop',rs.stop_name,'pickup_time',rs.pickup_time,'dropoff_time',rs.dropoff_time)
        from public.route_stops rs join public.bus_routes br on br.id = rs.route_id where rs.child_id = c.id limit 1),
     'bus', coalesce((select jsonb_agg(jsonb_build_object('route',br.name,'direction',t.direction,'event',e.event,'at',e.at) order by e.at)
        from public.trip_events e join public.transport_trips t on t.id = e.trip_id join public.bus_routes br on br.id = t.route_id
        where e.child_id = c.id and t.trip_date = today), '[]')
   ) order by c.full_name) from public.children c where c.id = any(kids)), '[]'),
  'invoices', coalesce((select jsonb_agg(jsonb_build_object('number',i.number,'title',i.title,'status',i.status,'due_date',i.due_date,'total',i.amount_sar,'paid',i.paid_total,'token',i.share_token) order by i.issue_date desc nulls last)
     from public.invoices i where i.organization_id = org and i.status in ('issued','paid') and (i.guardian_id = g.id or i.child_id = any(kids))), '[]'),
  'announcements', coalesce((select jsonb_agg(jsonb_build_object('title',n.title,'body',n.body,'pinned',n.pinned,'at',n.created_at) order by n.pinned desc, n.created_at desc)
     from (select * from public.announcements n0 where n0.organization_id = org and n0.audience in ('all','families')
           and (n0.section_id is null or n0.section_id in (select c.section_id from public.children c where c.id = any(kids)))
           order by n0.pinned desc, n0.created_at desc limit 20) n), '[]')
 );
end $$;

-- 3) Daily report message with the guardian's own portal link -------------------------------------
create function private.portal_token(guardian uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid; org uuid;
begin
 select p.token into t from private.guardian_portals p where p.guardian_id = guardian;
 if t is not null then return t; end if;
 select g.organization_id into org from public.guardians g where g.id = guardian;
 insert into private.guardian_portals(guardian_id,organization_id) values (guardian,org)
 on conflict (guardian_id) do nothing returning token into t;
 if t is null then select p.token into t from private.guardian_portals p where p.guardian_id = guardian; end if;
 return t;
end $$;
revoke all on function private.portal_token(uuid) from public,anon,authenticated;

create or replace function private.on_daily_report_message() returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.message_settings%rowtype; kid text; g record;
begin
 select * into s from public.message_settings m where m.organization_id = new.organization_id;
 if not found or not s.notify_daily_report then return null; end if;
 select c.full_name into kid from public.children c where c.id = new.child_id;
 for g in select gd.id, gd.full_name, gd.phone from public.child_guardians cg join public.guardians gd on gd.id = cg.guardian_id
          where cg.child_id = new.child_id and cg.organization_id = new.organization_id and gd.phone ~ '^\+?[0-9]{8,15}$' loop
  insert into public.message_outbox(organization_id,channel,to_phone,to_name,child_id,kind,body,dedupe_key)
  values (new.organization_id, s.channel, g.phone, g.full_name, new.child_id, 'daily_report',
   format('📝 تقرير يوم %s جاهز: %s/p/%s', kid, s.site_url, private.portal_token(g.id)),
   'daily:' || new.child_id || ':' || new.report_date || ':' || g.id)
  on conflict (organization_id,dedupe_key) where dedupe_key is not null do nothing;
 end loop;
 return null;
end $$;

-- 4) Announcements to families by message ---------------------------------------------------------
create function private.send_announcement(announcement uuid) returns integer language plpgsql security definer set search_path = '' as $$
declare n public.announcements%rowtype; s public.message_settings%rowtype; g record; sent integer := 0; school text; added integer;
begin
 select * into n from public.announcements a where a.id = announcement;
 if not found or not private.can_manage_org(n.organization_id) then raise exception 'Announcement not found' using errcode = 'P0002'; end if;
 if n.audience = 'staff' then raise exception 'Staff announcements are not sent to families' using errcode = '22023'; end if;
 select * into s from public.message_settings m where m.organization_id = n.organization_id;
 if not found then raise exception 'Turn on messages first' using errcode = '55000'; end if;
 school := private.school_name(n.organization_id);
 for g in select distinct gd.id, gd.full_name, gd.phone from public.child_guardians cg
          join public.guardians gd on gd.id = cg.guardian_id join public.children c on c.id = cg.child_id
          where cg.organization_id = n.organization_id and c.status = 'active' and gd.phone ~ '^\+?[0-9]{8,15}$'
            and (n.section_id is null or c.section_id = n.section_id) loop
  insert into public.message_outbox(organization_id,channel,to_phone,to_name,kind,body,dedupe_key)
  values (n.organization_id, s.channel, g.phone, g.full_name, 'announcement',
   left(format(E'📢 %s — %s\n%s\nالتفاصيل: %s/p/%s', school, n.title, n.body, s.site_url, private.portal_token(g.id)), 1500),
   'announce:' || n.id || ':' || g.id)
  on conflict (organization_id,dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics added = row_count;
  sent := sent + added;
 end loop;
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values (n.organization_id,auth.uid(),'announcements',n.id,'UPDATE');
 return sent;
end $$;
revoke all on function private.send_announcement(uuid) from public,anon,authenticated;
grant execute on function private.send_announcement(uuid) to authenticated;
create function public.send_announcement(announcement uuid) returns integer language sql set search_path = '' as $$ select private.send_announcement(announcement) $$;
revoke all on function public.send_announcement(uuid) from public,anon,authenticated,service_role;
grant execute on function public.send_announcement(uuid) to authenticated;
commit;
