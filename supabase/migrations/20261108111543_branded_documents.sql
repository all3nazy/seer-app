-- Branded financial documents: each organization's identity (logo, legal name, commercial
-- registration, VAT number, address, bank account) on invoices, receipts and quotes; quotes
-- built from the fee catalogue with discounts and converted to invoices; and private share links
-- so a family can open its own document from WhatsApp without an account.
-- Forward-only; adds tables, columns and functions, and changes no existing values.
begin;

-- 1) Organization profile: one row per organization. Managers edit; members read.
create table public.organization_profiles (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null unique references public.organizations(id) on delete cascade,
 legal_name text check (legal_name is null or length(btrim(legal_name)) between 1 and 160),
 cr_number text check (cr_number is null or cr_number ~ '^[0-9]{10}$'),
 vat_number text check (vat_number is null or vat_number ~ '^3[0-9]{13}3$'),
 license_number text check (license_number is null or length(btrim(license_number)) between 1 and 40),
 address text check (address is null or length(btrim(address)) between 1 and 300),
 city text check (city is null or length(btrim(city)) between 1 and 60),
 phone text check (phone is null or phone ~ '^\+?[0-9]{8,15}$'),
 email text check (email is null or (email = lower(btrim(email)) and length(email) between 3 and 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
 website text check (website is null or (length(website) <= 200 and website ~ '^https://[^[:space:]]+$')),
 bank_name text check (bank_name is null or length(btrim(bank_name)) between 1 and 80),
 iban text check (iban is null or iban ~ '^SA[0-9]{22}$'),
 brand_color text not null default '#3E1657' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
 -- A small raster logo kept inline (PNG, JPEG or WebP, up to ~300 KB once encoded). SVG is not
 -- accepted so no script can ride along with the image.
 logo_data text check (logo_data is null or (length(logo_data) <= 400000 and logo_data ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$')),
 invoice_footer text check (invoice_footer is null or length(invoice_footer) <= 500),
 quote_terms text check (quote_terms is null or length(quote_terms) <= 1000),
 updated_at timestamptz not null default now()
);
alter table public.organization_profiles enable row level security;
revoke all on public.organization_profiles from public,anon,authenticated;
grant select on public.organization_profiles to authenticated;
grant insert(organization_id,legal_name,cr_number,vat_number,license_number,address,city,phone,email,website,bank_name,iban,brand_color,logo_data,invoice_footer,quote_terms) on public.organization_profiles to authenticated;
grant update(legal_name,cr_number,vat_number,license_number,address,city,phone,email,website,bank_name,iban,brand_color,logo_data,invoice_footer,quote_terms) on public.organization_profiles to authenticated;
create policy organization_profiles_read on public.organization_profiles for select to authenticated using(private.is_org_member(organization_id));
create policy organization_profiles_insert on public.organization_profiles for insert to authenticated with check(private.can_manage_org(organization_id));
create policy organization_profiles_update on public.organization_profiles for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id));
create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function private.touch_updated_at() from public,anon,authenticated;
create trigger touch_updated_at before update on public.organization_profiles for each row execute function private.touch_updated_at();
create trigger keep_record_tenant before update on public.organization_profiles for each row execute function private.keep_record_tenant();
create trigger audit_operation after insert or update on public.organization_profiles for each row execute function private.audit_operation();

-- 2) Private share links. A random token per document; only managers can renew it.
alter table public.invoices add column share_token uuid not null default gen_random_uuid();
create unique index invoices_share_token_idx on public.invoices(share_token);

-- 3) Quotes (عروض الأسعار): same line maths as invoices; numbered when sent; converted once.
create table private.quote_counters (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 last_number integer not null default 0
);
revoke all on private.quote_counters from public,anon,authenticated,service_role;
alter table private.quote_counters enable row level security;

create table public.quotes (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 number integer,
 status text not null default 'draft' check (status in ('draft','sent','accepted','rejected','invoiced')),
 guardian_id uuid,
 child_id uuid,
 recipient_name text check (recipient_name is null or length(btrim(recipient_name)) between 1 and 120),
 recipient_phone text check (recipient_phone is null or recipient_phone ~ '^\+?[0-9]{8,15}$'),
 title text not null check (length(btrim(title)) between 1 and 120),
 issue_date date,
 valid_until date,
 notes text check (notes is null or length(notes) <= 1000),
 vat_borne_by_state boolean not null default false,
 subtotal numeric(12,2) not null default 0,
 discount_total numeric(12,2) not null default 0,
 vat_total numeric(12,2) not null default 0,
 vat_relief numeric(12,2) not null default 0,
 total numeric(12,2) not null default 0,
 invoice_id uuid,
 share_token uuid not null default gen_random_uuid(),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 constraint quotes_id_organization_id_key unique (id,organization_id),
 constraint quotes_recipient check (guardian_id is not null or recipient_name is not null),
 constraint quotes_guardian_fkey foreign key (guardian_id,organization_id) references public.guardians(id,organization_id) on delete set null (guardian_id),
 constraint quotes_child_fkey foreign key (child_id,organization_id) references public.children(id,organization_id) on delete set null (child_id),
 constraint quotes_invoice_fkey foreign key (invoice_id,organization_id) references public.invoices(id,organization_id) on delete set null (invoice_id)
);
create unique index quotes_org_number_idx on public.quotes(organization_id,number) where number is not null;
create unique index quotes_share_token_idx on public.quotes(share_token);
create index quotes_org_created_idx on public.quotes(organization_id,created_at desc);

create table public.quote_lines (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 quote_id uuid not null,
 fee_item_id uuid,
 description text not null check (length(btrim(description)) between 1 and 120),
 kind text not null default 'other' check (kind in ('tuition','registration','transport','uniform','books','meals','activity','other')),
 quantity numeric(8,2) not null default 1 check (quantity > 0 and quantity <= 1000),
 unit_price numeric(12,2) not null check (unit_price >= 0),
 discount numeric(12,2) not null default 0 check (discount >= 0),
 vat_rate numeric(5,2) not null default 15 check (vat_rate in (0,15)),
 sort_order integer not null default 0,
 constraint quote_lines_discount_le check (discount <= round(quantity * unit_price, 2)),
 constraint quote_lines_quote_fkey foreign key (quote_id,organization_id) references public.quotes(id,organization_id) on delete cascade,
 constraint quote_lines_item_fkey foreign key (fee_item_id,organization_id) references public.fee_items(id,organization_id) on delete set null (fee_item_id)
);
create index quote_lines_quote_idx on public.quote_lines(quote_id,sort_order);

create function private.recompute_quote(target uuid) returns void language plpgsql security definer set search_path = '' as $$
declare relief_flag boolean;
begin
 select q.vat_borne_by_state into relief_flag from public.quotes q where q.id = target;
 if not found then return; end if;
 perform set_config('seer.quote_sync', 'on', true);
 update public.quotes q set
  subtotal = t.gross, discount_total = t.discounts, vat_total = t.vat,
  vat_relief = case when relief_flag then t.tuition_vat else 0 end,
  total = t.gross - t.discounts + t.vat - case when relief_flag then t.tuition_vat else 0 end
 from (
  select coalesce(sum(round(l.quantity * l.unit_price, 2)),0) as gross,
         coalesce(sum(l.discount),0) as discounts,
         coalesce(sum(round((round(l.quantity * l.unit_price, 2) - l.discount) * l.vat_rate / 100, 2)),0) as vat,
         coalesce(sum(round((round(l.quantity * l.unit_price, 2) - l.discount) * l.vat_rate / 100, 2)) filter (where l.kind = 'tuition'),0) as tuition_vat
  from public.quote_lines l where l.quote_id = target
 ) t where q.id = target;
 perform set_config('seer.quote_sync', 'off', true);
end $$;
revoke all on function private.recompute_quote(uuid) from public,anon,authenticated;

create function private.after_quote_line() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 perform private.recompute_quote(case when TG_OP = 'DELETE' then old.quote_id else new.quote_id end);
 return null;
end $$;
revoke all on function private.after_quote_line() from public,anon,authenticated;

create function private.guard_quote_line() returns trigger language plpgsql security definer set search_path = '' as $$
declare state text;
begin
 select q.status into state from public.quotes q where q.id = case when TG_OP = 'DELETE' then old.quote_id else new.quote_id end;
 if state is distinct from 'draft' and auth.uid() is not null then
  raise exception 'Only draft quotes can change' using errcode = '42501';
 end if;
 if TG_OP = 'UPDATE' and new.quote_id <> old.quote_id then raise exception 'Line cannot move' using errcode = '42501'; end if;
 return case when TG_OP = 'DELETE' then old else new end;
end $$;
revoke all on function private.guard_quote_line() from public,anon,authenticated;

-- Quote guard: totals, number, author and link come from the database. A sent quote is frozen
-- except for its status: sent → accepted or rejected; accepted → invoiced only by conversion.
create function private.guard_quote() returns trigger language plpgsql security definer set search_path = '' as $$
declare next_number integer;
 syncing boolean := coalesce(current_setting('seer.quote_sync', true), '') = 'on';
 converting boolean := coalesce(current_setting('seer.quote_convert', true), '') = 'on';
 renewing boolean := coalesce(current_setting('seer.token_renew', true), '') = 'on';
begin
 if TG_OP = 'INSERT' then
  new.subtotal := 0; new.discount_total := 0; new.vat_total := 0; new.vat_relief := 0; new.total := 0;
  new.number := null; new.invoice_id := null; new.created_by := auth.uid(); new.created_at := now();
  new.status := 'draft'; new.share_token := gen_random_uuid();
  return new;
 end if;
 new.number := old.number; new.created_by := old.created_by; new.created_at := old.created_at;
 if not renewing then new.share_token := old.share_token; end if;
 if not syncing then
  new.subtotal := old.subtotal; new.discount_total := old.discount_total; new.vat_total := old.vat_total; new.vat_relief := old.vat_relief; new.total := old.total;
 end if;
 if not converting then new.invoice_id := old.invoice_id; end if;
 if new.status <> old.status then
  if not ((old.status = 'draft' and new.status = 'sent')
       or (old.status = 'sent' and new.status in ('accepted','rejected','draft'))
       or (old.status in ('sent','accepted') and new.status = 'invoiced' and converting and new.invoice_id is not null)) then
   raise exception 'This status change is not allowed' using errcode = '42501';
  end if;
  if new.status = 'sent' and new.total <= 0 then raise exception 'A quote needs an amount before it is sent' using errcode = '23514'; end if;
 end if;
 if old.status not in ('draft') and not syncing and not converting and new.status = old.status
    and (new.guardian_id, new.child_id, new.recipient_name, new.recipient_phone, new.title, new.valid_until, new.notes, new.vat_borne_by_state)
        is distinct from (old.guardian_id, old.child_id, old.recipient_name, old.recipient_phone, old.title, old.valid_until, old.notes, old.vat_borne_by_state) then
  raise exception 'Sent quotes cannot change; return it to draft first' using errcode = '42501';
 end if;
 if new.status <> 'draft' and new.number is null then
  insert into private.quote_counters(organization_id,last_number) values(new.organization_id,1)
   on conflict (organization_id) do update set last_number = private.quote_counters.last_number + 1
   returning last_number into next_number;
  new.number := next_number;
  new.issue_date := coalesce(new.issue_date, (now() at time zone 'Asia/Riyadh')::date);
 end if;
 return new;
end $$;
revoke all on function private.guard_quote() from public,anon,authenticated;

create function private.after_quote_relief() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.vat_borne_by_state is distinct from old.vat_borne_by_state then perform private.recompute_quote(new.id); end if;
 return null;
end $$;
revoke all on function private.after_quote_relief() from public,anon,authenticated;

create trigger guard_quote before insert or update on public.quotes for each row execute function private.guard_quote();
create trigger after_quote_relief after update of vat_borne_by_state on public.quotes for each row execute function private.after_quote_relief();
create trigger guard_quote_line before insert or update or delete on public.quote_lines for each row execute function private.guard_quote_line();
create trigger after_quote_line after insert or update or delete on public.quote_lines for each row execute function private.after_quote_line();

do $$
declare t text;
begin
 foreach t in array array['quotes','quote_lines'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from public,anon,authenticated', t);
  execute format('grant select,delete on public.%I to authenticated', t);
  execute format('create policy %I on public.%I for select to authenticated using(private.can_manage_org(organization_id))', t || '_read', t);
  execute format('create policy %I on public.%I for insert to authenticated with check(private.can_manage_org(organization_id))', t || '_insert', t);
  execute format('create policy %I on public.%I for update to authenticated using(private.can_manage_org(organization_id)) with check(private.can_manage_org(organization_id))', t || '_update', t);
  execute format('create trigger keep_record_tenant before update on public.%I for each row execute function private.keep_record_tenant()', t);
  execute format('create trigger audit_operation after insert or update or delete on public.%I for each row execute function private.audit_operation()', t);
  execute format('revoke truncate,references,trigger on public.%I from anon,authenticated', t);
 end loop;
end $$;
-- Only drafts can be deleted; a sent quote stays on record.
create policy quotes_delete on public.quotes for delete to authenticated using(private.can_manage_org(organization_id) and status = 'draft');
create policy quote_lines_delete on public.quote_lines for delete to authenticated using(private.can_manage_org(organization_id));
grant insert(organization_id,guardian_id,child_id,recipient_name,recipient_phone,title,valid_until,notes,vat_borne_by_state) on public.quotes to authenticated;
grant update(guardian_id,child_id,recipient_name,recipient_phone,title,valid_until,notes,vat_borne_by_state,status) on public.quotes to authenticated;
grant insert(organization_id,quote_id,fee_item_id,description,kind,quantity,unit_price,discount,vat_rate,sort_order), update(description,kind,quantity,unit_price,discount,vat_rate,sort_order) on public.quote_lines to authenticated;

-- 4) Convert a quote into an invoice with the same lines. Runs with the definer's rights so it can
--    link the invoice, after checking the caller manages the organization.
create function private.quote_to_invoice(quote uuid, issue boolean) returns uuid language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; inv uuid;
begin
 select * into q from public.quotes x where x.id = quote for update;
 if not found or not private.can_manage_org(q.organization_id) then raise exception 'Quote not found' using errcode = 'P0002'; end if;
 if q.status not in ('sent','accepted') then raise exception 'Send the quote before converting it' using errcode = '23514'; end if;
 if q.guardian_id is null and q.child_id is null then raise exception 'Link the quote to a guardian or a student first' using errcode = '23514'; end if;
 insert into public.invoices(organization_id,guardian_id,child_id,amount_sar,status,due_date,title,notes,vat_borne_by_state)
 values (q.organization_id,q.guardian_id,q.child_id,0,'draft',q.valid_until,q.title,q.notes,q.vat_borne_by_state) returning id into inv;
 insert into public.invoice_lines(organization_id,invoice_id,fee_item_id,description,kind,quantity,unit_price,discount,vat_rate,sort_order)
 select q.organization_id,inv,l.fee_item_id,l.description,l.kind,l.quantity,l.unit_price,l.discount,l.vat_rate,l.sort_order from public.quote_lines l where l.quote_id = q.id;
 if issue then update public.invoices set status = 'issued' where id = inv; end if;
 perform set_config('seer.quote_convert', 'on', true);
 update public.quotes set status = 'invoiced', invoice_id = inv where id = q.id;
 perform set_config('seer.quote_convert', 'off', true);
 return inv;
end $$;
revoke all on function private.quote_to_invoice(uuid,boolean) from public,anon,authenticated;
grant execute on function private.quote_to_invoice(uuid,boolean) to authenticated;
create function public.quote_to_invoice(quote uuid, issue boolean default false) returns uuid language sql set search_path = '' as $$ select private.quote_to_invoice(quote, issue) $$;
revoke all on function public.quote_to_invoice(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.quote_to_invoice(uuid,boolean) to authenticated;

-- 5) Renew a share link (the old one stops working). Managers only.
create function private.renew_share_token(doc_kind text, doc uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid; token uuid := gen_random_uuid();
begin
 if doc_kind = 'invoice' then select i.organization_id into org from public.invoices i where i.id = doc;
 elsif doc_kind = 'quote' then select q.organization_id into org from public.quotes q where q.id = doc;
 else raise exception 'Unknown document' using errcode = '22023'; end if;
 if org is null or not private.can_manage_org(org) then raise exception 'Document not found' using errcode = 'P0002'; end if;
 perform set_config('seer.token_renew', 'on', true);
 if doc_kind = 'invoice' then update public.invoices set share_token = token where id = doc;
 else update public.quotes set share_token = token where id = doc; end if;
 perform set_config('seer.token_renew', 'off', true);
 return token;
end $$;
revoke all on function private.renew_share_token(text,uuid) from public,anon,authenticated;
create function public.renew_share_token(doc_kind text, doc uuid) returns uuid language sql set search_path = '' as $$ select private.renew_share_token(doc_kind, doc) $$;
revoke all on function public.renew_share_token(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.renew_share_token(text,uuid) to authenticated;
grant execute on function private.renew_share_token(text,uuid) to authenticated;

-- The invoice guard keeps share_token unless a renewal is in progress.
create function private.keep_invoice_token() returns trigger language plpgsql set search_path = '' as $$
begin
 if TG_OP = 'INSERT' then new.share_token := gen_random_uuid();
 elsif new.share_token is distinct from old.share_token and current_setting('seer.token_renew', true) is distinct from 'on' then new.share_token := old.share_token; end if;
 return new;
end $$;
revoke all on function private.keep_invoice_token() from public,anon,authenticated;
create trigger keep_invoice_token before insert or update on public.invoices for each row execute function private.keep_invoice_token();

-- 6) What a share link shows: the document, its lines, payments (for invoices) and the issuing
--    organization's public profile. Drafts and void invoices are never shown.
create function private.shared_document(token uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
  'organization',(select jsonb_build_object('name',o.name,'legal_name',p.legal_name,'cr_number',p.cr_number,'vat_number',p.vat_number,'license_number',p.license_number,
    'address',p.address,'city',p.city,'phone',p.phone,'email',p.email,'website',p.website,'bank_name',p.bank_name,'iban',p.iban,'brand_color',coalesce(p.brand_color,'#3E1657'),
    'logo_data',p.logo_data,'invoice_footer',p.invoice_footer,'quote_terms',p.quote_terms)
   from public.organizations o left join public.organization_profiles p on p.organization_id = o.id where o.id = org));
end $$;
revoke all on function private.shared_document(uuid) from public,anon,authenticated;
create function public.shared_document(token uuid) returns jsonb language sql stable set search_path = '' as $$ select private.shared_document(token) $$;
revoke all on function public.shared_document(uuid) from public,anon,authenticated,service_role;
grant execute on function public.shared_document(uuid) to anon, authenticated;
grant execute on function private.shared_document(uuid) to anon, authenticated;
commit;
