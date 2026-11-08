-- Automatic messages and pickup confirmation.
-- * A message outbox fed by database events (absence, late arrival, pickup, bus, issued invoice,
--   daily report) according to each organization's settings. Until a WhatsApp/SMS provider is
--   subscribed, messages wait in the outbox and staff send them in one tap through WhatsApp;
--   once a provider is configured, the server dispatcher sends them automatically.
-- * Pickup confirmation: every hand-over creates a private link sent to the receiver by WhatsApp;
--   they confirm by typing their ID number, which must match the one on file.
-- Forward-only; adds tables, functions and triggers and changes no existing data.
begin;

create table public.message_settings (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 provider text not null default 'manual' check (provider in ('manual','whatsapp_cloud','unifonic','taqnyat','msegat','twilio')),
 channel text not null default 'whatsapp' check (channel in ('whatsapp','sms')),
 sender_name text check (sender_name is null or length(btrim(sender_name)) between 2 and 40),
 site_url text not null default 'https://seer-app-psi.vercel.app' check (site_url ~ '^https://[a-z0-9.-]+(:[0-9]+)?$'),
 notify_absence boolean not null default true,
 notify_late boolean not null default true,
 notify_pickup boolean not null default true,
 confirm_pickup boolean not null default true,
 notify_bus boolean not null default false,
 notify_invoice boolean not null default true,
 notify_daily_report boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.message_settings enable row level security;
revoke all on public.message_settings from public,anon,authenticated;
grant select on public.message_settings to authenticated;
grant insert(organization_id,provider,channel,sender_name,site_url,notify_absence,notify_late,notify_pickup,confirm_pickup,notify_bus,notify_invoice,notify_daily_report),
 update(provider,channel,sender_name,site_url,notify_absence,notify_late,notify_pickup,confirm_pickup,notify_bus,notify_invoice,notify_daily_report) on public.message_settings to authenticated;
create policy message_settings_read on public.message_settings for select to authenticated using(private.is_org_member(organization_id));
create policy message_settings_insert on public.message_settings for insert to authenticated with check(private.can_manage_org(organization_id));
create policy message_settings_update on public.message_settings for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id));
create trigger keep_record_tenant before update on public.message_settings for each row execute function private.keep_record_tenant();

create table public.message_outbox (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 channel text not null default 'whatsapp' check (channel in ('whatsapp','sms')),
 to_phone text not null check (to_phone ~ '^\+?[0-9]{8,15}$'),
 to_name text,
 child_id uuid,
 kind text not null check (kind in ('absence','late','pickup','pickup_confirm','bus','invoice','daily_report','announcement','custom')),
 body text not null check (length(body) between 1 and 1500),
 status text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped')),
 attempts integer not null default 0,
 last_error text check (last_error is null or length(last_error) <= 300),
 provider_ref text check (provider_ref is null or length(provider_ref) <= 120),
 dedupe_key text,
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 sent_by uuid references auth.users(id) on delete set null,
 constraint message_outbox_child_fkey foreign key (child_id,organization_id) references public.children(id,organization_id) on delete set null (child_id)
);
create index message_outbox_queue_idx on public.message_outbox(organization_id,status,created_at);
create unique index message_outbox_dedupe_idx on public.message_outbox(organization_id,dedupe_key) where dedupe_key is not null;
alter table public.message_outbox enable row level security;
revoke all on public.message_outbox from public,anon,authenticated;
grant select on public.message_outbox to authenticated;
grant insert(organization_id,channel,to_phone,to_name,child_id,kind,body) on public.message_outbox to authenticated;
create policy message_outbox_read on public.message_outbox for select to authenticated using(private.is_org_member(organization_id));
create policy message_outbox_insert on public.message_outbox for insert to authenticated with check(private.can_manage_org(organization_id) and kind in ('announcement','custom'));
revoke truncate,references,trigger on public.message_settings,public.message_outbox from anon,authenticated;

-- Staff mark a manually sent (or skipped) message; the dispatcher marks provider sends.
create function private.mark_message(message uuid, new_status text) returns void language plpgsql security definer set search_path = '' as $$
declare m public.message_outbox%rowtype;
begin
 select * into m from public.message_outbox o where o.id = message for update;
 if not found or not private.is_org_member(m.organization_id) then raise exception 'Message not found' using errcode = 'P0002'; end if;
 if new_status not in ('sent','skipped','queued') then raise exception 'Invalid status' using errcode = '22023'; end if;
 update public.message_outbox set status = new_status, sent_at = case when new_status = 'sent' then now() else null end, sent_by = auth.uid() where id = m.id;
end $$;
revoke all on function private.mark_message(uuid,text) from public,anon,authenticated;
grant execute on function private.mark_message(uuid,text) to authenticated;
create function public.mark_message(message uuid, new_status text) returns void language sql set search_path = '' as $$ select private.mark_message(message, new_status) $$;
revoke all on function public.mark_message(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.mark_message(uuid,text) to authenticated;

-- Dispatcher (server, service role): claim a batch and report results.
create function private.claim_messages(batch integer) returns setof public.message_outbox language sql security definer set search_path = '' as $$
 update public.message_outbox o set status = 'sending', attempts = o.attempts + 1
 where o.id in (select x.id from public.message_outbox x join public.message_settings s on s.organization_id = x.organization_id
                where x.status = 'queued' and s.provider <> 'manual' and x.attempts < 5 order by x.created_at limit least(greatest(batch,1),100) for update of x skip locked)
 returning o.*
$$;
create function private.report_message(message uuid, ok boolean, ref text, error text) returns void language sql security definer set search_path = '' as $$
 update public.message_outbox set status = case when ok then 'sent' when attempts >= 5 then 'failed' else 'queued' end,
  provider_ref = left(ref,120), last_error = case when ok then null else left(error,300) end, sent_at = case when ok then now() else null end where id = message
$$;
revoke all on function private.claim_messages(integer), private.report_message(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function private.claim_messages(integer), private.report_message(uuid,boolean,text,text) to service_role;
create function public.claim_messages(batch integer) returns setof public.message_outbox language sql set search_path = '' as $$ select * from private.claim_messages(batch) $$;
create function public.report_message(message uuid, ok boolean, ref text, error text) returns void language sql set search_path = '' as $$ select private.report_message(message, ok, ref, error) $$;
revoke all on function public.claim_messages(integer), public.report_message(uuid,boolean,text,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_messages(integer), public.report_message(uuid,boolean,text,text) to service_role;
grant usage on schema private to service_role;

-- Queue a message to every guardian (with a phone) of a child, once per dedupe key.
create function private.queue_family_message(org uuid, child uuid, kind text, body text, dedupe text) returns void language plpgsql security definer set search_path = '' as $$
declare s public.message_settings%rowtype; g record;
begin
 select * into s from public.message_settings m where m.organization_id = org;
 if not found then return; end if;
 for g in select gd.id, gd.full_name, gd.phone from public.child_guardians cg join public.guardians gd on gd.id = cg.guardian_id
          where cg.child_id = child and cg.organization_id = org and gd.phone ~ '^\+?[0-9]{8,15}$' loop
  insert into public.message_outbox(organization_id,channel,to_phone,to_name,child_id,kind,body,dedupe_key)
  values (org, s.channel, g.phone, g.full_name, child, kind, body, dedupe || ':' || g.id)
  on conflict (organization_id,dedupe_key) where dedupe_key is not null do nothing;
 end loop;
end $$;
revoke all on function private.queue_family_message(uuid,uuid,text,text,text) from public,anon,authenticated;

create function private.school_name(org uuid) returns text language sql stable security definer set search_path = '' as $$
 select coalesce((select p.legal_name from public.organization_profiles p where p.organization_id = org), (select o.name from public.organizations o where o.id = org))
$$;
revoke all on function private.school_name(uuid) from public,anon,authenticated;

create function private.on_attendance_message() returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.message_settings%rowtype; kid text;
begin
 if new.attendance_date <> (now() at time zone 'Asia/Riyadh')::date then return null; end if;
 if TG_OP = 'UPDATE' and new.status = old.status then return null; end if;
 select * into s from public.message_settings m where m.organization_id = new.organization_id;
 if not found then return null; end if;
 select c.full_name into kid from public.children c where c.id = new.child_id;
 if new.status = 'absent' and s.notify_absence then
  perform private.queue_family_message(new.organization_id, new.child_id, 'absence',
   format('السلام عليكم، نفيدكم بأن %s غائب اليوم عن %s. إذا عندكم عذر نرجو التواصل معنا.', kid, private.school_name(new.organization_id)), 'absence:' || new.child_id || ':' || new.attendance_date);
 elsif new.status = 'late' and s.notify_late then
  perform private.queue_family_message(new.organization_id, new.child_id, 'late',
   format('السلام عليكم، وصل %s متأخرًا اليوم إلى %s.', kid, private.school_name(new.organization_id)), 'late:' || new.child_id || ':' || new.attendance_date);
 end if;
 return null;
end $$;
revoke all on function private.on_attendance_message() from public,anon,authenticated;
create trigger on_attendance_message after insert or update of status on public.attendance for each row execute function private.on_attendance_message();

-- 2) Pickup confirmation links.
create table public.pickup_confirmations (
 pickup_id uuid primary key references public.pickups(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 token uuid not null unique default gen_random_uuid(),
 to_phone text,
 confirmed_at timestamptz,
 verified boolean not null default false,
 failed_attempts integer not null default 0,
 created_at timestamptz not null default now()
);
alter table public.pickup_confirmations enable row level security;
revoke all on public.pickup_confirmations from public,anon,authenticated;
grant select(pickup_id,organization_id,to_phone,confirmed_at,verified,failed_attempts,created_at) on public.pickup_confirmations to authenticated;
create policy pickup_confirmations_read on public.pickup_confirmations for select to authenticated using(private.is_org_member(organization_id));

create function private.on_pickup_message() returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.message_settings%rowtype; kid text; receiver_phone text; link_token uuid; school text;
begin
 select * into s from public.message_settings m where m.organization_id = new.organization_id;
 if not found then return null; end if;
 select c.full_name into kid from public.children c where c.id = new.child_id;
 school := private.school_name(new.organization_id);
 if new.guardian_id is not null then select g.phone into receiver_phone from public.guardians g where g.id = new.guardian_id;
 else select a.phone into receiver_phone from public.authorized_pickups a where a.id = new.authorized_id; end if;
 if s.confirm_pickup then
  insert into public.pickup_confirmations(pickup_id,organization_id,to_phone) values (new.id,new.organization_id,receiver_phone) returning pickup_confirmations.token into link_token;
  if receiver_phone ~ '^\+?[0-9]{8,15}$' then
   insert into public.message_outbox(organization_id,channel,to_phone,to_name,child_id,kind,body,dedupe_key)
   values (new.organization_id, s.channel, receiver_phone, new.picked_by_name, new.child_id, 'pickup_confirm',
    format('السلام عليكم %s، سلّمنا لكم %s الآن من %s. نرجو تأكيد الاستلام برقم هويتكم من الرابط: %s/c/%s', new.picked_by_name, kid, school, s.site_url, link_token),
    'pickup_confirm:' || new.id) on conflict do nothing;
  end if;
 end if;
 if s.notify_pickup then
  perform private.queue_family_message(new.organization_id, new.child_id, 'pickup',
   format('السلام عليكم، استلم %s الطالب %s من %s الساعة %s.', new.picked_by_name, kid, school, to_char(new.picked_at at time zone 'Asia/Riyadh', 'HH24:MI')), 'pickup:' || new.id);
 end if;
 return null;
end $$;
revoke all on function private.on_pickup_message() from public,anon,authenticated;
create trigger on_pickup_message after insert on public.pickups for each row execute function private.on_pickup_message();

-- What the confirmation page shows, and the confirmation itself (by ID number).
create function private.pickup_confirmation_view(token uuid) returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('child',c.full_name,'picked_by',p.picked_by_name,'picked_at',p.picked_at,'confirmed_at',pc.confirmed_at,'verified',pc.verified,
   'locked',pc.failed_attempts >= 5,'organization',private.school_name(p.organization_id),
   'brand_color',coalesce((select pr.brand_color from public.organization_profiles pr where pr.organization_id = p.organization_id),'#3E1657'))
 from public.pickup_confirmations pc join public.pickups p on p.id = pc.pickup_id join public.children c on c.id = p.child_id
 where pc.token = pickup_confirmation_view.token and pc.created_at > now() - interval '3 days'
$$;
create function private.confirm_pickup(token uuid, national_id text) returns text language plpgsql security definer set search_path = '' as $$
declare pc public.pickup_confirmations%rowtype; p public.pickups%rowtype; on_file text; given text := regexp_replace(translate(coalesce(national_id,''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '[^0-9]', '', 'g');
begin
 select * into pc from public.pickup_confirmations x where x.token = confirm_pickup.token and x.created_at > now() - interval '3 days' for update;
 if not found then return 'not_found'; end if;
 if pc.confirmed_at is not null then return 'already'; end if;
 if pc.failed_attempts >= 5 then return 'locked'; end if;
 if given !~ '^[12][0-9]{9}$' then return 'invalid'; end if;
 select * into p from public.pickups x where x.id = pc.pickup_id;
 if p.guardian_id is not null then select g.national_id into on_file from public.guardians g where g.id = p.guardian_id;
 else select a.national_id into on_file from public.authorized_pickups a where a.id = p.authorized_id; end if;
 if on_file is not null and on_file <> given then
  update public.pickup_confirmations set failed_attempts = failed_attempts + 1 where pickup_id = pc.pickup_id;
  return 'mismatch';
 end if;
 update public.pickup_confirmations set confirmed_at = now(), verified = on_file is not null where pickup_id = pc.pickup_id;
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values (pc.organization_id,null,'pickups',pc.pickup_id,'UPDATE');
 return case when on_file is null then 'confirmed_unverified' else 'confirmed' end;
end $$;
revoke all on function private.pickup_confirmation_view(uuid), private.confirm_pickup(uuid,text) from public,anon,authenticated;
grant execute on function private.pickup_confirmation_view(uuid), private.confirm_pickup(uuid,text) to anon,authenticated;
create function public.pickup_confirmation_view(token uuid) returns jsonb language sql stable set search_path = '' as $$ select private.pickup_confirmation_view(token) $$;
create function public.confirm_pickup(token uuid, national_id text) returns text language sql set search_path = '' as $$ select private.confirm_pickup(token, national_id) $$;
revoke all on function public.pickup_confirmation_view(uuid), public.confirm_pickup(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.pickup_confirmation_view(uuid), public.confirm_pickup(uuid,text) to anon,authenticated;

-- 3) Bus, invoices and daily reports.
create function private.on_bus_message() returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.message_settings%rowtype; kid text; trip public.transport_trips%rowtype;
begin
 select * into s from public.message_settings m where m.organization_id = new.organization_id;
 if not found or not s.notify_bus then return null; end if;
 select * into trip from public.transport_trips t where t.id = new.trip_id;
 select c.full_name into kid from public.children c where c.id = new.child_id;
 perform private.queue_family_message(new.organization_id, new.child_id, 'bus',
  case new.event when 'boarded' then format('🚌 %s صعد الباص %s.', kid, case when trip.direction = 'to_school' then 'متجهًا للمدرسة' else 'متجهًا للبيت' end)
   when 'dropped' then case when trip.direction = 'to_school' then format('🏫 %s وصل المدرسة بالسلامة.', kid) else format('🏠 %s نزل من الباص عند البيت.', kid) end
   else format('ℹ️ %s ما ركب الباص اليوم.', kid) end, 'bus:' || new.id);
 return null;
end $$;
revoke all on function private.on_bus_message() from public,anon,authenticated;
create trigger on_bus_message after insert on public.trip_events for each row execute function private.on_bus_message();

create function private.on_invoice_message() returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.message_settings%rowtype; body text;
begin
 if not (new.status = 'issued' and old.status = 'draft') or new.child_id is null then return null; end if;
 select * into s from public.message_settings m where m.organization_id = new.organization_id;
 if not found or not s.notify_invoice then return null; end if;
 body := format('السلام عليكم، صدرت فاتورة رقم %s من %s بمبلغ %s ر.س%s. تفاصيلها والسداد من الرابط: %s/d/%s',
  new.number, private.school_name(new.organization_id), to_char(new.amount_sar, 'FM999G999G990D00'),
  case when new.due_date is not null then format('، تستحق في %s', new.due_date) else '' end, s.site_url, new.share_token);
 perform private.queue_family_message(new.organization_id, new.child_id, 'invoice', body, 'invoice:' || new.id);
 return null;
end $$;
revoke all on function private.on_invoice_message() from public,anon,authenticated;
create trigger on_invoice_message after update of status on public.invoices for each row execute function private.on_invoice_message();

create function private.on_daily_report_message() returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.message_settings%rowtype; kid text;
begin
 select * into s from public.message_settings m where m.organization_id = new.organization_id;
 if not found or not s.notify_daily_report then return null; end if;
 select c.full_name into kid from public.children c where c.id = new.child_id;
 perform private.queue_family_message(new.organization_id, new.child_id, 'daily_report',
  format('📝 تقرير يوم %s جاهز. تقدرون تشوفونه في بوابة ولي الأمر.', kid), 'daily:' || new.child_id || ':' || new.report_date);
 return null;
end $$;
revoke all on function private.on_daily_report_message() from public,anon,authenticated;
create trigger on_daily_report_message after insert on public.daily_reports for each row execute function private.on_daily_report_message();
commit;
