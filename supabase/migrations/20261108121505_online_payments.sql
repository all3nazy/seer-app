-- Online payments foundation: each organization picks a gateway (Moyasar, HyperPay, Tap or
-- PayTabs, plus Tabby/Tamara instalments) and the methods it offers; families start a payment from
-- their invoice link; a confirmed payment is recorded in the ledger by the server only.
-- Until a gateway account exists, a built-in sandbox lets schools try the whole flow; sandbox
-- payments never touch the books. Gateway secret keys are never stored in readable tables.
-- Forward-only; adds tables and functions and replaces the share function to include pay options.
begin;

create table public.payment_settings (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 provider text not null default 'none' check (provider in ('none','sandbox','moyasar','hyperpay','tap','paytabs')),
 mode text not null default 'test' check (mode in ('test','live')),
 methods text[] not null default '{mada,visa_master,apple_pay}' check (methods <@ array['mada','visa_master','apple_pay','stc_pay','tabby','tamara']::text[] and cardinality(methods) between 1 and 6),
 publishable_key text check (publishable_key is null or (length(publishable_key) between 8 and 200 and publishable_key ~ '^[A-Za-z0-9_\-\.]+$')),
 is_enabled boolean not null default false,
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 constraint payment_settings_sandbox_test check (provider <> 'sandbox' or mode = 'test')
);
alter table public.payment_settings enable row level security;
revoke all on public.payment_settings from public,anon,authenticated;
grant select on public.payment_settings to authenticated;
grant insert(organization_id,provider,mode,methods,publishable_key,is_enabled), update(provider,mode,methods,publishable_key,is_enabled) on public.payment_settings to authenticated;
create policy payment_settings_read on public.payment_settings for select to authenticated using(private.can_manage_org(organization_id));
create policy payment_settings_insert on public.payment_settings for insert to authenticated with check(private.can_manage_org(organization_id));
create policy payment_settings_update on public.payment_settings for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id));
create function private.stamp_payment_settings() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_by := auth.uid(); new.updated_at := now(); return new; end $$;
revoke all on function private.stamp_payment_settings() from public,anon,authenticated;
create trigger stamp_payment_settings before insert or update on public.payment_settings for each row execute function private.stamp_payment_settings();
create trigger keep_record_tenant before update on public.payment_settings for each row execute function private.keep_record_tenant();
create function private.audit_payment_settings() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.audit_events(organization_id,actor_id,entity,record_id,action) values(new.organization_id,auth.uid(),'payment_settings',new.organization_id,TG_OP);
 return null;
end $$;
revoke all on function private.audit_payment_settings() from public,anon,authenticated;
create trigger audit_payment_settings after insert or update on public.payment_settings for each row execute function private.audit_payment_settings();

-- Every checkout attempt. Written only by functions; managers read.
create table public.payment_intents (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 invoice_id uuid not null,
 amount numeric(12,2) not null check (amount > 0),
 provider text not null,
 mode text not null,
 method text not null check (method in ('mada','visa_master','apple_pay','stc_pay','tabby','tamara')),
 status text not null default 'initiated' check (status in ('initiated','paid','failed','cancelled','expired')),
 provider_ref text check (provider_ref is null or length(provider_ref) <= 120),
 payment_id uuid references public.payments(id) on delete set null,
 failure_reason text check (failure_reason is null or length(failure_reason) <= 300),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 constraint payment_intents_invoice_fkey foreign key (invoice_id,organization_id) references public.invoices(id,organization_id) on delete cascade
);
create index payment_intents_org_idx on public.payment_intents(organization_id,created_at desc);
create unique index payment_intents_provider_ref_idx on public.payment_intents(provider,provider_ref) where provider_ref is not null;
alter table public.payment_intents enable row level security;
revoke all on public.payment_intents from public,anon,authenticated;
grant select on public.payment_intents to authenticated;
create policy payment_intents_read on public.payment_intents for select to authenticated using(private.can_manage_org(organization_id));
revoke truncate,references,trigger on public.payment_settings,public.payment_intents from anon,authenticated;

-- A family starts paying the remaining balance of an issued invoice from its share link.
create function private.start_online_payment(token uuid, method text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare inv public.invoices%rowtype; s public.payment_settings%rowtype; intent uuid; due numeric(12,2);
begin
 select * into inv from public.invoices i where i.share_token = token and i.status = 'issued';
 if not found then raise exception 'Invoice not payable' using errcode = 'P0002'; end if;
 due := inv.amount_sar - inv.paid_total;
 if due <= 0 then raise exception 'Nothing left to pay' using errcode = '23514'; end if;
 select * into s from public.payment_settings p where p.organization_id = inv.organization_id and p.is_enabled and p.provider <> 'none';
 if not found then raise exception 'Online payment is not enabled' using errcode = '42501'; end if;
 if not (method = any(s.methods)) then raise exception 'This method is not offered' using errcode = '22023'; end if;
 if (select count(*) from public.payment_intents x where x.invoice_id = inv.id and x.created_at > now() - interval '1 hour') >= 10 then
  raise exception 'Too many attempts; try again later' using errcode = '54000';
 end if;
 insert into public.payment_intents(organization_id,invoice_id,amount,provider,mode,method)
 values (inv.organization_id,inv.id,due,s.provider,s.mode,method) returning id into intent;
 return jsonb_build_object('intent',intent,'amount',due,'provider',s.provider,'mode',s.mode,'method',method,'publishable_key',s.publishable_key);
end $$;
revoke all on function private.start_online_payment(uuid,text) from public,anon,authenticated;
grant execute on function private.start_online_payment(uuid,text) to anon,authenticated;
create function public.start_online_payment(token uuid, method text) returns jsonb language sql set search_path = '' as $$ select private.start_online_payment(token, method) $$;
revoke all on function public.start_online_payment(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.start_online_payment(uuid,text) to anon,authenticated;

-- What the checkout page shows about an attempt (amount, invoice and school), given the invoice link.
create function private.payment_intent_view(token uuid, intent uuid) returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('id',x.id,'amount',x.amount,'status',x.status,'provider',x.provider,'mode',x.mode,'method',x.method,'invoice_number',i.number,'invoice_title',i.title,
   'organization',o.name,'brand_color',coalesce(p.brand_color,'#3E1657'),'logo_data',p.logo_data,
   'publishable_key',(select ps.publishable_key from public.payment_settings ps where ps.organization_id = x.organization_id and ps.provider = x.provider))
 from public.payment_intents x join public.invoices i on i.id = x.invoice_id join public.organizations o on o.id = x.organization_id
 left join public.organization_profiles p on p.organization_id = o.id
 where x.id = intent and i.share_token = token
$$;
revoke all on function private.payment_intent_view(uuid,uuid) from public,anon,authenticated;
grant execute on function private.payment_intent_view(uuid,uuid) to anon,authenticated;
create function public.payment_intent_view(token uuid, intent uuid) returns jsonb language sql stable set search_path = '' as $$ select private.payment_intent_view(token, intent) $$;
revoke all on function public.payment_intent_view(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.payment_intent_view(uuid,uuid) to anon,authenticated;

-- Sandbox only: finish or cancel a test attempt. Never records a payment in the ledger.
create function private.finish_sandbox_payment(token uuid, intent uuid, succeed boolean) returns text language plpgsql security definer set search_path = '' as $$
declare x public.payment_intents%rowtype;
begin
 select pi.* into x from public.payment_intents pi join public.invoices i on i.id = pi.invoice_id where pi.id = intent and i.share_token = token for update of pi;
 if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
 if x.provider <> 'sandbox' then raise exception 'Not a sandbox payment' using errcode = '42501'; end if;
 if x.status <> 'initiated' then return x.status; end if;
 update public.payment_intents set status = case when succeed then 'paid' else 'cancelled' end, completed_at = now(),
  provider_ref = 'sandbox-' || substr(replace(x.id::text,'-',''),1,12) where id = x.id;
 return case when succeed then 'paid' else 'cancelled' end;
end $$;
revoke all on function private.finish_sandbox_payment(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function private.finish_sandbox_payment(uuid,uuid,boolean) to anon,authenticated;
create function public.finish_sandbox_payment(token uuid, intent uuid, succeed boolean) returns text language sql set search_path = '' as $$ select private.finish_sandbox_payment(token, intent, succeed) $$;
revoke all on function public.finish_sandbox_payment(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.finish_sandbox_payment(uuid,uuid,boolean) to anon,authenticated;

-- Live gateways: the server's webhook, after verifying the gateway's signature, settles the attempt
-- with the service role. The payment lands in the ledger with its receipt number, once.
create function private.settle_online_payment(intent uuid, ref text, paid_amount numeric, succeeded boolean, reason text default null) returns uuid language plpgsql security definer set search_path = '' as $$
declare x public.payment_intents%rowtype; pay uuid; ledger_method text;
begin
 select * into x from public.payment_intents p where p.id = intent for update;
 if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
 if x.provider in ('none','sandbox') then raise exception 'Not a live gateway payment' using errcode = '42501'; end if;
 if x.status = 'paid' then return x.payment_id; end if;
 if not succeeded then
  update public.payment_intents set status = 'failed', provider_ref = coalesce(ref, provider_ref), failure_reason = left(reason, 300), completed_at = now() where id = x.id;
  return null;
 end if;
 if paid_amount is distinct from x.amount then raise exception 'Amount mismatch' using errcode = '23514'; end if;
 ledger_method := case x.method when 'visa_master' then 'card' when 'stc_pay' then 'other' else x.method end;
 insert into public.payments(organization_id,invoice_id,amount,method,paid_on,reference,notes)
 values (x.organization_id,x.invoice_id,x.amount,ledger_method,(now() at time zone 'Asia/Riyadh')::date,left(coalesce(ref,x.id::text),80),'دفع إلكتروني عبر ' || x.provider)
 returning id into pay;
 update public.payment_intents set status = 'paid', provider_ref = ref, payment_id = pay, completed_at = now() where id = x.id;
 return pay;
end $$;
revoke all on function private.settle_online_payment(uuid,text,numeric,boolean,text) from public,anon,authenticated;
grant execute on function private.settle_online_payment(uuid,text,numeric,boolean,text) to service_role;
create function public.settle_online_payment(intent uuid, ref text, paid_amount numeric, succeeded boolean, reason text default null) returns uuid language sql set search_path = '' as $$ select private.settle_online_payment(intent, ref, paid_amount, succeeded, reason) $$;
revoke all on function public.settle_online_payment(uuid,text,numeric,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.settle_online_payment(uuid,text,numeric,boolean,text) to service_role;
grant usage on schema private to service_role;

-- The invoice link tells the family whether and how they can pay online.
create or replace function private.shared_document(token uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare inv public.invoices%rowtype; q public.quotes%rowtype; org uuid; doc jsonb; lines jsonb; pays jsonb := '[]'::jsonb; kind text;
begin
 if token is null then return null; end if;
 select * into inv from public.invoices i where i.share_token = token and i.status in ('issued','paid');
 if found then
  kind := 'invoice'; org := inv.organization_id;
  doc := jsonb_build_object('number',inv.number,'title',inv.title,'status',inv.status,'issue_date',inv.issue_date,'due_date',inv.due_date,'notes',inv.notes,
   'subtotal',inv.subtotal,'discount_total',inv.discount_total,'vat_total',inv.vat_total,'vat_relief',inv.vat_relief,'total',inv.amount_sar,'paid_total',inv.paid_total,
   'child',(select c.full_name from public.children c where c.id = inv.child_id),'recipient',(select g.full_name from public.guardians g where g.id = inv.guardian_id));
  select coalesce(jsonb_agg(jsonb_build_object('description',l.description,'kind',l.kind,'quantity',l.quantity,'unit_price',l.unit_price,'discount',l.discount,'vat_rate',l.vat_rate) order by l.sort_order, l.id),'[]') into lines from public.invoice_lines l where l.invoice_id = inv.id;
  select coalesce(jsonb_agg(jsonb_build_object('receipt_number',p.receipt_number,'amount',p.amount,'method',p.method,'paid_on',p.paid_on) order by p.receipt_number),'[]') into pays from public.payments p where p.invoice_id = inv.id;
 else
  select * into q from public.quotes x where x.share_token = token and x.status <> 'draft';
  if not found then return null; end if;
  kind := 'quote'; org := q.organization_id;
  doc := jsonb_build_object('number',q.number,'title',q.title,'status',q.status,'issue_date',q.issue_date,'due_date',q.valid_until,'notes',q.notes,
   'subtotal',q.subtotal,'discount_total',q.discount_total,'vat_total',q.vat_total,'vat_relief',q.vat_relief,'total',q.total,'paid_total',0,
   'child',(select c.full_name from public.children c where c.id = q.child_id),'recipient',coalesce((select g.full_name from public.guardians g where g.id = q.guardian_id), q.recipient_name));
  select coalesce(jsonb_agg(jsonb_build_object('description',l.description,'kind',l.kind,'quantity',l.quantity,'unit_price',l.unit_price,'discount',l.discount,'vat_rate',l.vat_rate) order by l.sort_order, l.id),'[]') into lines from public.quote_lines l where l.quote_id = q.id;
 end if;
 return jsonb_build_object('kind',kind,'document',doc,'lines',lines,'payments',pays,
  'pay', case when kind = 'invoice' and inv.status = 'issued' and inv.amount_sar > inv.paid_total then
     (select jsonb_build_object('provider',s.provider,'mode',s.mode,'methods',to_jsonb(s.methods)) from public.payment_settings s where s.organization_id = org and s.is_enabled and s.provider <> 'none')
   else null end,
  'organization',(select jsonb_build_object('name',o.name,'legal_name',p.legal_name,'cr_number',p.cr_number,'vat_number',p.vat_number,'license_number',p.license_number,
    'address',p.address,'city',p.city,'phone',p.phone,'email',p.email,'website',p.website,'bank_name',p.bank_name,'iban',p.iban,'brand_color',coalesce(p.brand_color,'#3E1657'),
    'logo_data',p.logo_data,'invoice_footer',p.invoice_footer,'quote_terms',p.quote_terms)
   from public.organizations o left join public.organization_profiles p on p.organization_id = o.id where o.id = org));
end $$;
commit;
