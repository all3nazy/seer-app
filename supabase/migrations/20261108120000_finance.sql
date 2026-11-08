-- Finance: fee catalogue, fee plans (packages) with installments, discounts, itemised invoices
-- with VAT, payments with receipts, and per-organization invoice numbering.
-- Forward-only; apply once after review. Everything financial stays manager-only, as invoices are.
-- Totals and balances are computed by the database; the browser can never set them.
begin;

-- 1) Catalogue and packages.
create table public.fee_items (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 80),
 kind text not null check (kind in ('tuition','registration','transport','uniform','books','meals','activity','other')),
 default_amount numeric(12,2) not null default 0 check (default_amount >= 0),
 vat_rate numeric(5,2) not null default 15 check (vat_rate in (0,15)),
 is_active boolean not null default true,
 constraint fee_items_id_organization_id_key unique (id,organization_id),
 constraint fee_items_unique_name unique (organization_id,name)
);
create table public.fee_plans (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 80),
 grade_level_id uuid,
 installments integer not null default 1 check (installments between 1 and 12),
 notes text check (notes is null or length(notes) <= 500),
 constraint fee_plans_id_organization_id_key unique (id,organization_id),
 constraint fee_plans_unique_name unique (organization_id,name),
 constraint fee_plans_grade_fkey foreign key (grade_level_id,organization_id) references public.grade_levels(id,organization_id) on delete set null (grade_level_id)
);
create table public.fee_plan_items (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 fee_plan_id uuid not null,
 fee_item_id uuid not null,
 amount numeric(12,2) not null check (amount >= 0),
 constraint fee_plan_items_unique unique (fee_plan_id,fee_item_id),
 constraint fee_plan_items_plan_fkey foreign key (fee_plan_id,organization_id) references public.fee_plans(id,organization_id) on delete cascade,
 constraint fee_plan_items_item_fkey foreign key (fee_item_id,organization_id) references public.fee_items(id,organization_id) on delete restrict
);
create table public.discounts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 80),
 reason text not null default 'other' check (reason in ('sibling','staff','scholarship','early_payment','other')),
 kind text not null check (kind in ('percent','fixed')),
 value numeric(12,2) not null check (value > 0 and (kind <> 'percent' or value <= 100)),
 is_active boolean not null default true,
 constraint discounts_id_organization_id_key unique (id,organization_id),
 constraint discounts_unique_name unique (organization_id,name)
);

-- 2) Invoices gain a number, a child, dates, VAT handling and computed totals.
create table private.invoice_counters (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 last_number integer not null default 0
);
revoke all on private.invoice_counters from public,anon,authenticated,service_role;
alter table private.invoice_counters enable row level security;

alter table public.invoices add column number integer;
alter table public.invoices add column child_id uuid;
alter table public.invoices add constraint invoices_child_fkey foreign key (child_id,organization_id) references public.children(id,organization_id) on delete set null (child_id);
alter table public.invoices add column issue_date date;
alter table public.invoices add column due_date date;
alter table public.invoices add column title text check (title is null or length(btrim(title)) between 1 and 120);
alter table public.invoices add column notes text check (notes is null or length(notes) <= 1000);
-- Saudi citizens' tuition VAT is borne by the state at approved private schools; when set, VAT on
-- tuition lines is shown on the invoice but not charged to the family.
alter table public.invoices add column vat_borne_by_state boolean not null default false;
alter table public.invoices add column subtotal numeric(12,2) not null default 0;
alter table public.invoices add column discount_total numeric(12,2) not null default 0;
alter table public.invoices add column vat_total numeric(12,2) not null default 0;
alter table public.invoices add column vat_relief numeric(12,2) not null default 0;
alter table public.invoices add column paid_total numeric(12,2) not null default 0;
alter table public.invoices add constraint invoices_id_organization_id_key unique (id,organization_id);
create unique index invoices_org_number_idx on public.invoices(organization_id,number) where number is not null;
create index invoices_org_due_idx on public.invoices(organization_id,due_date) where status = 'issued';
create index invoices_org_child_idx on public.invoices(organization_id,child_id);

create table public.invoice_lines (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 invoice_id uuid not null,
 fee_item_id uuid,
 description text not null check (length(btrim(description)) between 1 and 120),
 kind text not null default 'other' check (kind in ('tuition','registration','transport','uniform','books','meals','activity','other')),
 quantity numeric(8,2) not null default 1 check (quantity > 0 and quantity <= 1000),
 unit_price numeric(12,2) not null check (unit_price >= 0),
 discount numeric(12,2) not null default 0 check (discount >= 0),
 vat_rate numeric(5,2) not null default 15 check (vat_rate in (0,15)),
 sort_order integer not null default 0,
 constraint invoice_lines_discount_le check (discount <= round(quantity * unit_price, 2)),
 constraint invoice_lines_invoice_fkey foreign key (invoice_id,organization_id) references public.invoices(id,organization_id) on delete cascade,
 constraint invoice_lines_item_fkey foreign key (fee_item_id,organization_id) references public.fee_items(id,organization_id) on delete set null (fee_item_id)
);
create index invoice_lines_invoice_idx on public.invoice_lines(invoice_id,sort_order);

create table public.payments (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 invoice_id uuid not null,
 receipt_number integer,
 amount numeric(12,2) not null check (amount > 0),
 method text not null check (method in ('cash','bank_transfer','mada','card','apple_pay','google_pay','tabby','tamara','cheque','other')),
 paid_on date not null,
 reference text check (reference is null or length(btrim(reference)) between 1 and 80),
 notes text check (notes is null or length(notes) <= 500),
 recorded_by uuid references auth.users(id) on delete set null,
 recorded_at timestamptz not null default now(),
 constraint payments_invoice_fkey foreign key (invoice_id,organization_id) references public.invoices(id,organization_id) on delete restrict
);
create unique index payments_org_receipt_idx on public.payments(organization_id,receipt_number);
create index payments_org_date_idx on public.payments(organization_id,paid_on desc);
create index payments_invoice_idx on public.payments(invoice_id);
create table private.receipt_counters (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 last_number integer not null default 0
);
revoke all on private.receipt_counters from public,anon,authenticated,service_role;
alter table private.receipt_counters enable row level security;

-- 3) Computation. Line totals: net = qty*price - discount; VAT on net; relief for tuition when
--    the state bears the VAT. amount_sar (the payable total) = net + VAT - relief.
create function private.recompute_invoice(target uuid) returns void language plpgsql security definer set search_path = '' as $$
declare
 relief_flag boolean;
 lines_exist boolean;
begin
 select i.vat_borne_by_state into relief_flag from public.invoices i where i.id = target;
 if not found then return; end if;
 select exists(select 1 from public.invoice_lines l where l.invoice_id = target) into lines_exist;
 if not lines_exist then
  update public.invoices set subtotal = 0, discount_total = 0, vat_total = 0, vat_relief = 0 where id = target;
  return;
 end if;
 update public.invoices i set
  subtotal = t.gross, discount_total = t.discounts, vat_total = t.vat,
  vat_relief = case when relief_flag then t.tuition_vat else 0 end,
  amount_sar = t.gross - t.discounts + t.vat - case when relief_flag then t.tuition_vat else 0 end
 from (
  select coalesce(sum(round(l.quantity * l.unit_price, 2)),0) as gross,
         coalesce(sum(l.discount),0) as discounts,
         coalesce(sum(round((round(l.quantity * l.unit_price, 2) - l.discount) * l.vat_rate / 100, 2)),0) as vat,
         coalesce(sum(round((round(l.quantity * l.unit_price, 2) - l.discount) * l.vat_rate / 100, 2)) filter (where l.kind = 'tuition'),0) as tuition_vat
  from public.invoice_lines l where l.invoice_id = target
 ) t where i.id = target;
end $$;
revoke all on function private.recompute_invoice(uuid) from public,anon,authenticated;

create function private.after_invoice_line() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 perform private.recompute_invoice(case when TG_OP = 'DELETE' then old.invoice_id else new.invoice_id end);
 return null;
end $$;
revoke all on function private.after_invoice_line() from public,anon,authenticated;

-- Lines change only while the invoice is a draft; issued invoices are corrected by voiding.
create function private.guard_invoice_line() returns trigger language plpgsql security definer set search_path = '' as $$
declare state text;
begin
 select i.status into state from public.invoices i where i.id = case when TG_OP = 'DELETE' then old.invoice_id else new.invoice_id end;
 if state is distinct from 'draft' and auth.uid() is not null then
  raise exception 'Only draft invoices can change' using errcode = '42501';
 end if;
 if TG_OP = 'UPDATE' and new.invoice_id <> old.invoice_id then raise exception 'Line cannot move' using errcode = '42501'; end if;
 return case when TG_OP = 'DELETE' then old else new end;
end $$;
revoke all on function private.guard_invoice_line() from public,anon,authenticated;


-- Payments: only on issued invoices, never more than the balance; the receipt number, recorder
-- and time come from the database; paying in full marks the invoice paid.
create function private.guard_payment() returns trigger language plpgsql security definer set search_path = '' as $$
declare inv public.invoices%rowtype; next_number integer;
begin
 if TG_OP = 'UPDATE' then raise exception 'Payments cannot be edited; delete and record again' using errcode = '42501'; end if;
 select * into inv from public.invoices i where i.id = new.invoice_id and i.organization_id = new.organization_id for update;
 if not found then raise exception 'Invoice not found' using errcode = '23503'; end if;
 if inv.status <> 'issued' then raise exception 'Payments need an issued, unpaid invoice' using errcode = '23514'; end if;
 if inv.paid_total + new.amount > inv.amount_sar then raise exception 'Payment exceeds the balance' using errcode = '23514'; end if;
 if new.paid_on > (now() at time zone 'Asia/Riyadh')::date then raise exception 'Payment date is in the future' using errcode = '23514'; end if;
 insert into private.receipt_counters(organization_id,last_number) values(new.organization_id,1)
  on conflict (organization_id) do update set last_number = private.receipt_counters.last_number + 1 returning last_number into next_number;
 new.receipt_number := next_number;
 new.recorded_by := auth.uid();
 new.recorded_at := now();
 return new;
end $$;
revoke all on function private.guard_payment() from public,anon,authenticated;

create function private.after_payment() returns trigger language plpgsql security definer set search_path = '' as $$
declare target uuid := case when TG_OP = 'DELETE' then old.invoice_id else new.invoice_id end; paid numeric(12,2); total numeric(12,2);
begin
 select coalesce(sum(p.amount),0) into paid from public.payments p where p.invoice_id = target;
 select i.amount_sar into total from public.invoices i where i.id = target;
 -- The invoice trigger keeps paid_total; set it here with a session-free update path.
 update public.invoices set paid_total = paid where id = target;
 perform set_config('seer.payment_sync', 'on', true);
 update public.invoices set status = case when paid >= total and total > 0 then 'paid' when status = 'paid' then 'issued' else status end where id = target;
 perform set_config('seer.payment_sync', 'off', true);
 return null;
end $$;
revoke all on function private.after_payment() from public,anon,authenticated;

-- Invoice guard: computed columns and numbers come from the database; issued invoices are frozen
-- except for status changes; payment-driven updates may change paid_total and the paid status.
create function private.guard_invoice() returns trigger language plpgsql security definer set search_path = '' as $$
declare next_number integer; syncing boolean := current_setting('seer.payment_sync', true) = 'on';
begin
 if TG_OP = 'INSERT' then
  new.subtotal := 0; new.discount_total := 0; new.vat_total := 0; new.vat_relief := 0; new.paid_total := 0; new.number := null;
  if new.status = 'void' then new.status := 'draft'; end if;
 elsif pg_trigger_depth() > 1 then
  -- Updates from recompute and payment triggers: keep identity, allow computed columns.
  new.number := old.number;
  if not syncing and new.status <> old.status then new.status := old.status; end if;
 else
  new.subtotal := old.subtotal; new.discount_total := old.discount_total; new.vat_total := old.vat_total;
  new.vat_relief := old.vat_relief; new.paid_total := old.paid_total; new.number := old.number;
  if exists(select 1 from public.invoice_lines l where l.invoice_id = old.id) then new.amount_sar := old.amount_sar; end if;
  if old.status <> 'draft' and auth.uid() is not null then
   if (new.amount_sar, new.guardian_id, new.child_id, new.issue_date, new.vat_borne_by_state, new.title) is distinct from
      (old.amount_sar, old.guardian_id, old.child_id, old.issue_date, old.vat_borne_by_state, old.title) then
    raise exception 'Issued invoices cannot change; void and reissue' using errcode = '42501';
   end if;
   if old.status = 'void' and new.status <> 'void' then raise exception 'Void invoices stay void' using errcode = '42501'; end if;
   if new.status = 'draft' then raise exception 'Issued invoices cannot return to draft' using errcode = '42501'; end if;
  end if;
  if new.status = 'void' and old.status <> 'void' and old.paid_total > 0 then
   raise exception 'Remove payments before voiding' using errcode = '23514';
  end if;
  if new.status = 'paid' and old.status <> 'paid' and old.paid_total < old.amount_sar and auth.uid() is not null
     and exists(select 1 from public.invoice_lines l where l.invoice_id = old.id) then
   raise exception 'Record payments to mark an itemised invoice paid' using errcode = '23514';
  end if;
  if new.status = 'issued' and old.status = 'draft' and new.amount_sar <= 0 then
   raise exception 'An invoice needs an amount before it is issued' using errcode = '23514';
  end if;
 end if;
 if new.status in ('issued','paid') and new.number is null then
  insert into private.invoice_counters(organization_id,last_number) values(new.organization_id,1)
   on conflict (organization_id) do update set last_number = private.invoice_counters.last_number + 1
   returning last_number into next_number;
  new.number := next_number;
  new.issue_date := coalesce(new.issue_date, (now() at time zone 'Asia/Riyadh')::date);
 end if;
 return new;
end $$;
revoke all on function private.guard_invoice() from public,anon,authenticated;

create trigger guard_invoice before insert or update on public.invoices for each row execute function private.guard_invoice();
create trigger guard_invoice_line before insert or update or delete on public.invoice_lines for each row execute function private.guard_invoice_line();
create trigger after_invoice_line after insert or update or delete on public.invoice_lines for each row execute function private.after_invoice_line();
create trigger guard_payment before insert or update on public.payments for each row execute function private.guard_payment();
create trigger after_payment after insert or delete on public.payments for each row execute function private.after_payment();
-- Recompute when the VAT relief flag changes on a draft.
create function private.after_invoice_relief() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.vat_borne_by_state is distinct from old.vat_borne_by_state then perform private.recompute_invoice(new.id); end if;
 return null;
end $$;
revoke all on function private.after_invoice_relief() from public,anon,authenticated;
create trigger after_invoice_relief after update of vat_borne_by_state on public.invoices for each row execute function private.after_invoice_relief();

-- 4) Access: managers only, tenant-fixed, audited. Computed columns are not client-writable.
do $$
declare t text;
begin
 foreach t in array array['fee_items','fee_plans','fee_plan_items','discounts','invoice_lines','payments'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from public,anon,authenticated', t);
  execute format('grant select,delete on public.%I to authenticated', t);
  execute format('create policy %I on public.%I for select to authenticated using(private.can_manage_org(organization_id))', t || '_read', t);
  execute format('create policy %I on public.%I for insert to authenticated with check(private.can_manage_org(organization_id))', t || '_insert', t);
  execute format('create policy %I on public.%I for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id))', t || '_update', t);
  if t <> 'payments' then
   execute format('create policy %I on public.%I for delete to authenticated using(private.can_manage_org(organization_id))', t || '_delete', t);
  end if;
  execute format('create trigger keep_record_tenant before update on public.%I for each row execute function private.keep_record_tenant()', t);
  execute format('create trigger audit_operation after insert or update or delete on public.%I for each row execute function private.audit_operation()', t);
  execute format('revoke truncate,references,trigger on public.%I from anon,authenticated', t);
 end loop;
end $$;
grant insert(organization_id,name,kind,default_amount,vat_rate,is_active), update(name,kind,default_amount,vat_rate,is_active) on public.fee_items to authenticated;
grant insert(organization_id,name,grade_level_id,installments,notes), update(name,grade_level_id,installments,notes) on public.fee_plans to authenticated;
grant insert(organization_id,fee_plan_id,fee_item_id,amount), update(amount) on public.fee_plan_items to authenticated;
grant insert(organization_id,name,reason,kind,value,is_active), update(name,reason,kind,value,is_active) on public.discounts to authenticated;
grant insert(organization_id,invoice_id,fee_item_id,description,kind,quantity,unit_price,discount,vat_rate,sort_order), update(description,kind,quantity,unit_price,discount,vat_rate,sort_order) on public.invoice_lines to authenticated;
grant insert(organization_id,invoice_id,amount,method,paid_on,reference,notes) on public.payments to authenticated;
-- Invoices: replace the table-wide grants with explicit columns.
revoke insert,update on public.invoices from authenticated;
grant insert(organization_id,guardian_id,child_id,amount_sar,status,due_date,title,notes,vat_borne_by_state) on public.invoices to authenticated;
grant update(guardian_id,child_id,amount_sar,status,due_date,title,notes,vat_borne_by_state) on public.invoices to authenticated;
-- A payment can be removed only on the day it was recorded (to fix mistakes); refunds later
-- need an explicit correction record, which a future migration can add.
create policy payments_delete on public.payments for delete to authenticated
 using(private.can_manage_org(organization_id) and recorded_at > now() - interval '1 day');
-- 5) Generate a plan's installment invoices for every student in a grade or section, atomically,
--    under the caller's RLS. Amounts split evenly; the last installment takes the remainder.
--    An optional discount applies per line (percent) or to the first installment (fixed).
create function public.generate_plan_invoices(plan uuid, target_section uuid, target_grade uuid, first_due date,
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
  where c.organization_id = p.organization_id
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
revoke all on function public.generate_plan_invoices(uuid,uuid,uuid,date,integer,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.generate_plan_invoices(uuid,uuid,uuid,date,integer,uuid,boolean) to authenticated;
commit;
