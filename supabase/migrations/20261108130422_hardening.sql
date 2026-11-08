-- Hardening after the platform-wide security and workflow review.
-- 1) Online payments: every gateway event is checked against the school's own webhook secret
--    (stored hashed, never readable); test-mode and non-SAR events never reach the ledger; a payment
--    that can no longer be recorded (invoice changed meanwhile) is held for review instead of being
--    lost; starting a new attempt cancels the older open ones.
-- 2) Messages: staff no longer see invoice or pickup-confirmation messages (they carry private
--    links); a sent message cannot be re-queued; the provider account, sender name and link domain
--    are platform settings; manual messages only go to guardians on file; the dispatcher has a daily
--    cap per school and recovers stuck batches; settings changes are audited.
-- 3) Corrections cancel messages still waiting: absent → present skips the absence message, and
--    undoing a pickup skips its messages and confirmation link.
-- 4) Family portal links are audited when issued or renewed.
-- Forward-only.
begin;

-- 1) Online payments ------------------------------------------------------------------------------
alter table public.payment_intents drop constraint payment_intents_status_check;
alter table public.payment_intents add constraint payment_intents_status_check check (status in ('initiated','paid','failed','cancelled','expired','needs_review'));

create table private.payment_webhook_secrets (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 provider text not null check (provider in ('moyasar','hyperpay','tap','paytabs')),
 secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 primary key (organization_id, provider)
);
alter table private.payment_webhook_secrets enable row level security;
revoke all on private.payment_webhook_secrets from public,anon,authenticated;

-- The manager pastes the gateway's webhook secret; the server hashes it before it gets here.
create function private.set_payment_webhook_secret(org uuid, gateway text, secret_hash text) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not private.can_manage_org(org) then raise exception 'Not allowed' using errcode = '42501'; end if;
 if secret_hash is null then delete from private.payment_webhook_secrets w where w.organization_id = org and w.provider = gateway;
 else
  insert into private.payment_webhook_secrets(organization_id,provider,secret_hash,updated_by) values (org,gateway,secret_hash,auth.uid())
  on conflict (organization_id,provider) do update set secret_hash = excluded.secret_hash, updated_by = excluded.updated_by, updated_at = now();
 end if;
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values (org,auth.uid(),'payment_webhook_secret',org,'UPDATE');
end $$;
create function private.payment_webhook_configured(org uuid) returns text[] language sql stable security definer set search_path = '' as $$
 select coalesce(array_agg(w.provider order by w.provider), '{}') from private.payment_webhook_secrets w where w.organization_id = org and private.can_manage_org(org)
$$;
revoke all on function private.set_payment_webhook_secret(uuid,text,text), private.payment_webhook_configured(uuid) from public,anon,authenticated;
grant execute on function private.set_payment_webhook_secret(uuid,text,text), private.payment_webhook_configured(uuid) to authenticated;
create function public.set_payment_webhook_secret(org uuid, gateway text, secret_hash text) returns void language sql set search_path = '' as $$ select private.set_payment_webhook_secret(org, gateway, secret_hash) $$;
create function public.payment_webhook_configured(org uuid) returns text[] language sql stable set search_path = '' as $$ select private.payment_webhook_configured(org) $$;
revoke all on function public.set_payment_webhook_secret(uuid,text,text), public.payment_webhook_configured(uuid) from public,anon,authenticated,service_role;
grant execute on function public.set_payment_webhook_secret(uuid,text,text), public.payment_webhook_configured(uuid) to authenticated;

-- Starting a new attempt cancels the older open ones for the same invoice.
create or replace function private.start_online_payment(token uuid, method text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare inv public.invoices%rowtype; s public.payment_settings%rowtype; intent uuid; due numeric(12,2);
begin
 select * into inv from public.invoices i where i.share_token = token and i.status = 'issued' for update;
 if not found then raise exception 'Invoice not payable' using errcode = 'P0002'; end if;
 due := inv.amount_sar - inv.paid_total;
 if due <= 0 then raise exception 'Nothing left to pay' using errcode = '23514'; end if;
 select * into s from public.payment_settings p where p.organization_id = inv.organization_id and p.is_enabled and p.provider <> 'none';
 if not found then raise exception 'Online payment is not enabled' using errcode = '42501'; end if;
 if not (method = any(s.methods)) then raise exception 'This method is not offered' using errcode = '22023'; end if;
 if (select count(*) from public.payment_intents x where x.invoice_id = inv.id and x.created_at > now() - interval '1 hour') >= 10 then
  raise exception 'Too many attempts; try again later' using errcode = '54000';
 end if;
 update public.payment_intents set status = 'cancelled', completed_at = now() where invoice_id = inv.id and status = 'initiated';
 insert into public.payment_intents(organization_id,invoice_id,amount,provider,mode,method)
 values (inv.organization_id,inv.id,due,s.provider,s.mode,method) returning id into intent;
 return jsonb_build_object('intent',intent,'amount',due,'provider',s.provider,'mode',s.mode,'method',method,'publishable_key',s.publishable_key);
end $$;

drop function public.settle_online_payment(uuid,text,numeric,boolean,text);
drop function private.settle_online_payment(uuid,text,numeric,boolean,text);
-- Settles a gateway event. token_hash is the SHA-256 of the secret the event carried; it must match
-- the school's own secret for that gateway. Returns the outcome for the webhook's response.
create function private.settle_online_payment(intent uuid, ref text, paid_amount numeric, currency text, live boolean, succeeded boolean, reason text, token_hash text) returns text language plpgsql security definer set search_path = '' as $$
declare x public.payment_intents%rowtype; inv public.invoices%rowtype; pay uuid; ledger_method text; stored text;
begin
 select * into x from public.payment_intents p where p.id = intent for update;
 if not found then return 'not_found'; end if;
 if x.provider in ('none','sandbox') then return 'not_live'; end if;
 select w.secret_hash into stored from private.payment_webhook_secrets w where w.organization_id = x.organization_id and w.provider = x.provider;
 if stored is null or token_hash is null or stored <> token_hash then return 'unauthorized'; end if;
 if x.status in ('paid','needs_review') then return 'already'; end if;
 if not succeeded then
  if x.status = 'initiated' then
   update public.payment_intents set status = 'failed', provider_ref = coalesce(left(ref,120), provider_ref), failure_reason = left(reason, 300), completed_at = now() where id = x.id;
  end if;
  return 'failed';
 end if;
 if paid_amount is distinct from x.amount or upper(coalesce(currency,'')) <> 'SAR' then
  update public.payment_intents set status = 'needs_review', provider_ref = left(ref,120), completed_at = now(),
   failure_reason = format('المبلغ أو العملة لا تطابق (%s %s)', paid_amount, currency) where id = x.id;
  return 'needs_review';
 end if;
 -- Test-mode payments behave like the sandbox: the attempt shows as paid, the books stay untouched.
 if x.mode <> 'live' or live is not true then
  if x.mode = 'live' then
   update public.payment_intents set status = 'needs_review', provider_ref = left(ref,120), completed_at = now(), failure_reason = 'وصل حدث تجريبي لعملية حقيقية' where id = x.id;
   return 'needs_review';
  end if;
  update public.payment_intents set status = 'paid', provider_ref = left(ref,120), completed_at = now(), failure_reason = 'وضع تجريبي: لا يُسجّل في الدفاتر' where id = x.id;
  return 'test';
 end if;
 select * into inv from public.invoices i where i.id = x.invoice_id for update;
 if inv.status <> 'issued' or inv.amount_sar - inv.paid_total < x.amount then
  update public.payment_intents set status = 'needs_review', provider_ref = left(ref,120), completed_at = now(),
   failure_reason = 'دُفع المبلغ لكن الفاتورة تغيّرت أو سُددت؛ راجع واسترد الفرق' where id = x.id;
  return 'needs_review';
 end if;
 ledger_method := case x.method when 'visa_master' then 'card' when 'stc_pay' then 'other' else x.method end;
 insert into public.payments(organization_id,invoice_id,amount,method,paid_on,reference,notes)
 values (x.organization_id,x.invoice_id,x.amount,ledger_method,(now() at time zone 'Asia/Riyadh')::date,left(coalesce(ref,x.id::text),80),'دفع إلكتروني عبر ' || x.provider)
 returning id into pay;
 update public.payment_intents set status = 'paid', provider_ref = left(ref,120), payment_id = pay, completed_at = now(), failure_reason = null where id = x.id;
 return 'recorded';
end $$;
revoke all on function private.settle_online_payment(uuid,text,numeric,text,boolean,boolean,text,text) from public,anon,authenticated;
grant execute on function private.settle_online_payment(uuid,text,numeric,text,boolean,boolean,text,text) to service_role;
create function public.settle_online_payment(intent uuid, ref text, paid_amount numeric, currency text, live boolean, succeeded boolean, reason text, token_hash text) returns text language sql set search_path = '' as $$
 select private.settle_online_payment(intent, ref, paid_amount, currency, live, succeeded, reason, token_hash) $$;
revoke all on function public.settle_online_payment(uuid,text,numeric,text,boolean,boolean,text,text) from public,anon,authenticated,service_role;
grant execute on function public.settle_online_payment(uuid,text,numeric,text,boolean,boolean,text,text) to service_role;

-- 2) Messages -------------------------------------------------------------------------------------
-- Invoice and pickup-confirmation messages carry private links; only managers see them.
create function private.can_see_message(org uuid, kind text) returns boolean language sql stable security definer set search_path = '' as $$
 select private.can_manage_org(org) or (private.is_org_member(org) and kind not in ('invoice','pickup_confirm'))
$$;
revoke all on function private.can_see_message(uuid,text) from public,anon,authenticated;
grant execute on function private.can_see_message(uuid,text) to authenticated;
drop policy message_outbox_read on public.message_outbox;
create policy message_outbox_read on public.message_outbox for select to authenticated using(private.can_see_message(organization_id, kind));

-- Manual messages go only to guardians on file.
drop policy message_outbox_insert on public.message_outbox;
create policy message_outbox_insert on public.message_outbox for insert to authenticated with check(
 private.can_manage_org(organization_id) and kind in ('announcement','custom')
 and exists (select 1 from public.guardians g where g.organization_id = message_outbox.organization_id and g.phone = message_outbox.to_phone));

create or replace function private.mark_message(message uuid, new_status text) returns void language plpgsql security definer set search_path = '' as $$
declare m public.message_outbox%rowtype;
begin
 select * into m from public.message_outbox o where o.id = message for update;
 if not found or not private.can_see_message(m.organization_id, m.kind) then raise exception 'Message not found' using errcode = 'P0002'; end if;
 if new_status not in ('sent','skipped','queued') then raise exception 'Invalid status' using errcode = '22023'; end if;
 if new_status = 'queued' and m.status not in ('failed','skipped') then raise exception 'Only failed or skipped messages can be retried' using errcode = '22023'; end if;
 if m.status = 'sending' then raise exception 'Message is being sent' using errcode = '55000'; end if;
 update public.message_outbox set status = new_status, sent_at = case when new_status = 'sent' then now() else null end, sent_by = auth.uid(),
  attempts = case when new_status = 'queued' then 0 else attempts end where id = m.id;
end $$;

-- Provider, sender name and link domain are platform settings.
revoke insert, update on public.message_settings from authenticated;
grant insert(organization_id,channel,notify_absence,notify_late,notify_pickup,confirm_pickup,notify_bus,notify_invoice,notify_daily_report),
 update(channel,notify_absence,notify_late,notify_pickup,confirm_pickup,notify_bus,notify_invoice,notify_daily_report) on public.message_settings to authenticated;
create function private.audit_message_settings() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values(new.organization_id,auth.uid(),'message_settings',new.organization_id,TG_OP);
 return null;
end $$;
revoke all on function private.audit_message_settings() from public,anon,authenticated;
create trigger audit_message_settings after insert or update on public.message_settings for each row execute function private.audit_message_settings();

-- Dispatcher: a daily cap per school and recovery of batches stuck in "sending".
alter table public.message_outbox add column claimed_at timestamptz;
create or replace function private.claim_messages(batch integer) returns setof public.message_outbox language sql security definer set search_path = '' as $$
 with stuck as (
  update public.message_outbox set status = 'queued' where status = 'sending' and claimed_at < now() - interval '10 minutes' returning id
 ), today as (
  select organization_id, count(*) as used from public.message_outbox where attempts > 0 and claimed_at > now() - interval '1 day' group by organization_id
 )
 update public.message_outbox o set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
 where o.id in (select x.id from public.message_outbox x join public.message_settings s on s.organization_id = x.organization_id
                left join today t on t.organization_id = x.organization_id
                where x.status = 'queued' and s.provider <> 'manual' and x.attempts < 5 and coalesce(t.used,0) < 500
                order by x.created_at limit least(greatest(batch,1),100) for update of x skip locked)
 returning o.*
$$;

-- 3) Corrections cancel waiting messages -----------------------------------------------------------
-- A message skipped by a correction comes back if the status returns (absent → present → absent).
create or replace function private.queue_family_message(org uuid, child uuid, kind text, body text, dedupe text) returns void language plpgsql security definer set search_path = '' as $$
declare s public.message_settings%rowtype; g record;
begin
 select * into s from public.message_settings m where m.organization_id = org;
 if not found then return; end if;
 for g in select gd.id, gd.full_name, gd.phone from public.child_guardians cg join public.guardians gd on gd.id = cg.guardian_id
          where cg.child_id = child and cg.organization_id = org and gd.phone ~ '^\+?[0-9]{8,15}$' loop
  insert into public.message_outbox(organization_id,channel,to_phone,to_name,child_id,kind,body,dedupe_key)
  values (org, s.channel, g.phone, g.full_name, child, kind, body, dedupe || ':' || g.id)
  on conflict (organization_id,dedupe_key) where dedupe_key is not null
  do update set status = 'queued', last_error = null, attempts = 0, body = excluded.body, created_at = now() where public.message_outbox.status = 'skipped';
 end loop;
end $$;
create or replace function private.on_attendance_message() returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.message_settings%rowtype; kid text;
begin
 if new.attendance_date <> (now() at time zone 'Asia/Riyadh')::date then return null; end if;
 if TG_OP = 'UPDATE' and new.status = old.status then return null; end if;
 if TG_OP = 'UPDATE' and old.status in ('absent','late') then
  update public.message_outbox set status = 'skipped', last_error = 'تصحّحت حالة الحضور'
  where organization_id = new.organization_id and status = 'queued'
   and dedupe_key like (case old.status when 'absent' then 'absence' else 'late' end) || ':' || new.child_id || ':' || new.attendance_date || ':%';
 end if;
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

create function private.on_pickup_undo() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 update public.message_outbox set status = 'skipped', last_error = 'أُلغي التسليم'
 where organization_id = old.organization_id and status = 'queued'
  and (dedupe_key = 'pickup_confirm:' || old.id or dedupe_key like 'pickup:' || old.id || ':%');
 return null;
end $$;
revoke all on function private.on_pickup_undo() from public,anon,authenticated;
create trigger on_pickup_undo after delete on public.pickups for each row execute function private.on_pickup_undo();

-- 4) Portal links are audited ----------------------------------------------------------------------
create function private.audit_guardian_portal() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values(new.organization_id,auth.uid(),'guardian_portals',new.guardian_id,TG_OP);
 return null;
end $$;
revoke all on function private.audit_guardian_portal() from public,anon,authenticated;
create trigger audit_guardian_portal after insert or update on private.guardian_portals for each row execute function private.audit_guardian_portal();
commit;
