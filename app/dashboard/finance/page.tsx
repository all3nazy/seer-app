import Link from "next/link";
import { loadOrgContext } from "../../../lib/org-context";
import { OrgSwitcher, OrgUnavailable } from "../../../components/org-unavailable";
import { FinanceRecordForm, FinanceRow, GenerateInvoicesForm, InvoiceHeaderForm } from "../../../components/finance-forms";
import { balance, discountReasonLabels, feeKindLabels, invoiceLabel, invoiceStatusLabels, invoiceStatusTone, paymentMethodLabels, sar, type FeeKind, type Invoice, type Payment, type PaymentMethod } from "../../../lib/finance";
import { sectionLabel } from "../../../lib/academics";
import { isIsoDate, riyadhToday } from "../../../lib/students";

export const dynamic = "force-dynamic";
export const metadata = { title: "المالية" };
const tabs = { overview: "نظرة عامة", invoices: "الفواتير", payments: "المدفوعات", setup: "الرسوم والباقات" } as const;
type Tab = keyof typeof tabs;
const pageSize = 30;
const shortDate = (value: string | null) => value ? new Date(value).toLocaleDateString("ar-SA", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : "—";

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager, organizations } = context;
  if (!manager) return <section className="card"><h1>المالية</h1><p>المالية لمسؤول المنشأة فقط.</p></section>;
  const tab: Tab = params.tab && params.tab in tabs ? params.tab as Tab : "overview";
  const orgParam = encodeURIComponent(org);
  const today = riyadhToday();
  const monthStart = `${today.slice(0, 8)}01`;
  const [childrenResult, guardiansResult] = await Promise.all([
    client.from("children").select("id,full_name").eq("organization_id", org).order("full_name").limit(1000),
    client.from("guardians").select("id,full_name").eq("organization_id", org).order("full_name").limit(1000),
  ]);
  const childName = new Map(((childrenResult.data ?? []) as { id: string; full_name: string }[]).map(row => [row.id, row.full_name]));
  const guardianName = new Map(((guardiansResult.data ?? []) as { id: string; full_name: string }[]).map(row => [row.id, row.full_name]));
  const header = <>
    <header className="page-head">
      <div><h1>المالية</h1><p>فواتير {orgName} ومدفوعاتها ورسومها.</p></div>
      <OrgSwitcher path="/dashboard/finance" current={org} organizations={organizations} extra={{ tab }} />
    </header>
    <nav className="segments" aria-label="أقسام المالية">{(Object.keys(tabs) as Tab[]).map(key => <Link key={key} href={`/dashboard/finance?org=${orgParam}&tab=${key}`} aria-current={key === tab ? "page" : undefined}>{tabs[key]}</Link>)}
      <Link href={`/dashboard/finance/quotes?org=${orgParam}`}>عروض الأسعار</Link><Link href={`/dashboard/finance/branding?org=${orgParam}`}>هوية المستندات</Link></nav>
  </>;
  const invoiceRow = (invoice: Invoice) => <Link key={invoice.id} className="list-row" href={`/dashboard/finance/invoices/${invoice.id}?org=${orgParam}`}>
    <span className="body"><span className="title">{invoiceLabel(invoice)}{invoice.number && invoice.title ? ` — ${invoice.title}` : ""}</span>
      <span className="sub">{[invoice.child_id ? childName.get(invoice.child_id) : null, invoice.guardian_id ? guardianName.get(invoice.guardian_id) : null, invoice.due_date ? `يستحق ${shortDate(invoice.due_date)}` : null].filter(Boolean).join(" · ") || "بدون طالب"}</span></span>
    <span style={{ display: "grid", justifyItems: "end", gap: 4 }}><strong>{sar(invoice.amount_sar)}</strong>
      {invoice.status === "issued" && Number(invoice.paid_total) > 0 ? <span className="chip-soft coral">متبقي {sar(balance(invoice))}</span>
        : <span className={`chip-soft ${invoice.due_date && invoice.status === "issued" && invoice.due_date < today ? "rose" : invoiceStatusTone[invoice.status] ?? ""}`}>{invoice.due_date && invoice.status === "issued" && invoice.due_date < today ? "متأخرة" : invoiceStatusLabels[invoice.status] ?? invoice.status}</span>}</span>
  </Link>;
  const invoiceColumns = "id,number,title,status,guardian_id,child_id,issue_date,due_date,notes,vat_borne_by_state,subtotal,discount_total,vat_total,vat_relief,amount_sar,paid_total,created_at";

  if (tab === "overview") {
    const [open, monthPayments, overdue, drafts] = await Promise.all([
      client.from("invoices").select("amount_sar,paid_total").eq("organization_id", org).eq("status", "issued").limit(10000),
      client.from("payments").select("amount,method").eq("organization_id", org).gte("paid_on", monthStart).limit(10000),
      client.from("invoices").select(invoiceColumns).eq("organization_id", org).eq("status", "issued").lt("due_date", today).order("due_date").limit(20),
      client.from("invoices").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "draft"),
    ]);
    const outstanding = ((open.data ?? []) as { amount_sar: number; paid_total: number }[]).reduce((sum, row) => sum + Number(row.amount_sar) - Number(row.paid_total), 0);
    const collected = ((monthPayments.data ?? []) as { amount: number; method: PaymentMethod }[]);
    const byMethod = new Map<PaymentMethod, number>();
    for (const row of collected) byMethod.set(row.method, (byMethod.get(row.method) ?? 0) + Number(row.amount));
    const overdueRows = (overdue.data ?? []) as Invoice[];
    return <>{header}
      {open.error ? <p role="alert" className="info-banner">تعذر تحميل المالية. إذا هذي أول مرة، يلزم تطبيق ترحيل المالية.</p> : <>
        <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", marginBottom: 24 }}>
          <div className="stat mint"><span className="label">المحصّل هذا الشهر</span><span className="figure">{sar(collected.reduce((sum, row) => sum + Number(row.amount), 0))}</span></div>
          <div className="stat peach"><span className="label">المتبقي على الفواتير الصادرة</span><span className="figure">{sar(outstanding)}</span></div>
          <Link className="stat rose" href={`/dashboard/finance?org=${orgParam}&tab=invoices&status=overdue`}><span className="label">فواتير متأخرة</span><span className="figure">{overdueRows.length.toLocaleString("ar-SA")}{overdueRows.length === 20 ? "+" : ""}</span></Link>
          <Link className="stat lilac" href={`/dashboard/finance?org=${orgParam}&tab=invoices&status=draft`}><span className="label">مسودات</span><span className="figure">{(drafts.count ?? 0).toLocaleString("ar-SA")}</span></Link>
        </div>
        {byMethod.size ? <section className="card" style={{ marginBottom: 24 }}><h2>التحصيل هذا الشهر حسب طريقة الدفع</h2>
          <ul className="records">{[...byMethod.entries()].sort((a, b) => b[1] - a[1]).map(([method, amount]) => <li key={method}><span>{paymentMethodLabels[method]}</span><strong>{sar(amount)}</strong></li>)}</ul></section> : null}
        <section className="card"><h2>المتأخرات</h2>
          {overdueRows.length ? <div className="list">{overdueRows.map(invoiceRow)}</div> : <p className="hint">ما فيه فواتير متأخرة.</p>}
        </section>
      </>}
    </>;
  }

  if (tab === "invoices") {
    const status = ["draft", "issued", "paid", "void", "overdue"].includes(params.status ?? "") ? params.status : undefined;
    const requestedPage = Number(params.page ?? 1);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 10000 ? requestedPage : 1;
    let query = client.from("invoices").select(invoiceColumns, { count: "exact" }).eq("organization_id", org);
    if (status === "overdue") query = query.eq("status", "issued").lt("due_date", today);
    else if (status) query = query.eq("status", status);
    const { data, count, error } = await query.order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
    const url = (target: number) => `/dashboard/finance?${new URLSearchParams({ org, tab, ...(status ? { status } : {}), page: String(target) })}`;
    return <>{header}
      <nav className="segments" aria-label="حالة الفاتورة">
        <Link href={`/dashboard/finance?org=${orgParam}&tab=invoices`} aria-current={!status ? "page" : undefined}>الكل</Link>
        {[["draft", "مسودات"], ["issued", "صادرة"], ["overdue", "متأخرة"], ["paid", "مسددة"], ["void", "ملغاة"]].map(([key, label]) => <Link key={key} href={`/dashboard/finance?org=${orgParam}&tab=invoices&status=${key}`} aria-current={status === key ? "page" : undefined}>{label}</Link>)}
      </nav>
      <section className="card" style={{ marginBottom: 24 }}><details><summary>فاتورة جديدة</summary><div style={{ marginTop: 12 }}>
        <InvoiceHeaderForm organizationId={org} childrenOptions={[...childName].map(([id, name]) => ({ id, name }))} guardians={[...guardianName].map(([id, name]) => ({ id, name }))} />
      </div></details></section>
      {error ? <p role="alert" className="info-banner">تعذر تحميل الفواتير.</p> : (data ?? []).length ? <div className="list">{((data ?? []) as Invoice[]).map(invoiceRow)}</div> : <p className="empty">ما فيه فواتير.</p>}
      <nav aria-label="صفحات الفواتير" style={{ display: "flex", gap: 24, marginBlock: 16 }}>
        {page > 1 ? <Link href={url(page - 1)}>الصفحة السابقة</Link> : null}
        {page * pageSize < (count ?? 0) ? <Link href={url(page + 1)}>الصفحة التالية</Link> : null}
      </nav>
    </>;
  }

  if (tab === "payments") {
    const from = isIsoDate(params.from) ? params.from : monthStart;
    const to = isIsoDate(params.to) ? params.to : today;
    const { data, error } = await client.from("payments").select("id,invoice_id,receipt_number,amount,method,paid_on,reference,notes,recorded_at,recorded_by").eq("organization_id", org).gte("paid_on", from).lte("paid_on", to).order("paid_on", { ascending: false }).order("receipt_number", { ascending: false }).limit(500);
    const rows = (data ?? []) as Payment[];
    return <>{header}
      <form className="toolbar" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginBottom: 18 }}>
        <input type="hidden" name="org" value={org} /><input type="hidden" name="tab" value="payments" />
        <label>من<input type="date" name="from" defaultValue={from} /></label>
        <label>إلى<input type="date" name="to" defaultValue={to} max={today} /></label>
        <button type="submit" className="btn">عرض</button>
        <a href={`/dashboard/finance/export?${new URLSearchParams({ org, from, to })}`} download>تحميل ملف جدول (CSV)</a>
      </form>
      <section className="card">
        {error ? <p role="alert">تعذر تحميل المدفوعات.</p> : rows.length ? <>
          <p><strong>الإجمالي: {sar(rows.reduce((sum, row) => sum + Number(row.amount), 0))}</strong> في {rows.length.toLocaleString("ar-SA")} دفعة{rows.length === 500 ? " (أول ٥٠٠)" : ""}</p>
          <div className="table-wrap"><table className="links-table" style={{ width: "100%" }}>
            <thead><tr><th scope="col">الإيصال</th><th scope="col">التاريخ</th><th scope="col">المبلغ</th><th scope="col">الطريقة</th><th scope="col">المرجع</th><th scope="col"><span className="sr-only">الفاتورة</span></th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.id}><td>{row.receipt_number}</td><td>{shortDate(row.paid_on)}</td><td>{sar(row.amount)}</td><td>{paymentMethodLabels[row.method] ?? row.method}</td><td dir="ltr">{row.reference ?? ""}</td><td><Link href={`/dashboard/finance/invoices/${row.invoice_id}?org=${orgParam}`}>الفاتورة</Link></td></tr>)}</tbody>
          </table></div>
        </> : <p className="hint">ما فيه مدفوعات في هذه الفترة.</p>}
      </section>
    </>;
  }

  const [items, plans, planItems, discounts, grades, sections] = await Promise.all([
    client.from("fee_items").select("id,name,kind,default_amount,vat_rate,is_active").eq("organization_id", org).order("kind").order("name"),
    client.from("fee_plans").select("id,name,grade_level_id,installments,notes").eq("organization_id", org).order("name"),
    client.from("fee_plan_items").select("id,fee_plan_id,fee_item_id,amount").eq("organization_id", org),
    client.from("discounts").select("id,name,reason,kind,value,is_active").eq("organization_id", org).order("name"),
    client.from("grade_levels").select("id,name").eq("organization_id", org).order("sort_order"),
    client.from("sections").select("id,name,grade_level_id").eq("organization_id", org).order("name"),
  ]);
  if (items.error) return <>{header}<p role="alert" className="info-banner">تعذر تحميل الرسوم. إذا هذي أول مرة، يلزم تطبيق ترحيل المالية.</p></>;
  const itemRows = (items.data ?? []) as { id: string; name: string; kind: FeeKind; default_amount: number; vat_rate: number; is_active: boolean }[];
  const planRows = (plans.data ?? []) as { id: string; name: string; grade_level_id: string | null; installments: number; notes: string | null }[];
  const planItemRows = (planItems.data ?? []) as { id: string; fee_plan_id: string; fee_item_id: string; amount: number }[];
  const discountRows = (discounts.data ?? []) as { id: string; name: string; reason: keyof typeof discountReasonLabels; kind: string; value: number; is_active: boolean }[];
  const gradeRows = (grades.data ?? []) as { id: string; name: string }[];
  const sectionRows = (sections.data ?? []) as { id: string; name: string; grade_level_id: string }[];
  const options = { grades: gradeRows, items: itemRows.filter(item => item.is_active).map(item => ({ id: item.id, name: item.name })), plans: planRows.map(plan => ({ id: plan.id, name: plan.name })) };
  return <>{header}
    <div style={{ display: "grid", gap: 24 }}>
      <section className="card"><h2>بنود الرسوم</h2>
        {itemRows.length ? <ul className="records">{itemRows.map(item => <FinanceRow key={item.id} organizationId={org} table="fee_items" record={item}>
          <strong>{item.name}</strong> <span className="chip-soft">{feeKindLabels[item.kind]}</span> {item.is_active ? null : <span className="chip-soft rose">معطّل</span>}
          <span className="hint" style={{ display: "block" }}>{sar(item.default_amount)} · ضريبة {Number(item.vat_rate).toLocaleString("ar-SA")}٪</span>
        </FinanceRow>)}</ul> : <p className="hint">أضف بنود الرسوم أولًا، مثل الرسوم الدراسية والتسجيل والنقل.</p>}
        <details style={{ marginTop: 16 }}><summary>إضافة بند</summary><div style={{ marginTop: 12 }}><FinanceRecordForm organizationId={org} table="fee_items" /></div></details>
      </section>
      <section className="card"><h2>الباقات</h2>
        {planRows.length ? <ul className="records">{planRows.map(plan => {
          const lines = planItemRows.filter(line => line.fee_plan_id === plan.id);
          const total = lines.reduce((sum, line) => sum + Number(line.amount), 0);
          return <FinanceRow key={plan.id} organizationId={org} table="fee_plans" record={plan} options={options}>
            <strong>{plan.name}</strong> <span className="chip-soft">{plan.installments.toLocaleString("ar-SA")} قسط</span> {plan.grade_level_id ? <span className="chip-soft">{gradeRows.find(grade => grade.id === plan.grade_level_id)?.name}</span> : null}
            <span className="hint" style={{ display: "block" }}>الإجمالي قبل الضريبة: {sar(total)}</span>
            {lines.length ? <ul className="records" style={{ marginTop: 8 }}>{lines.map(line => <FinanceRow key={line.id} organizationId={org} table="fee_plan_items" record={line}>
              {itemRows.find(item => item.id === line.fee_item_id)?.name ?? "بند"} — {sar(line.amount)}
            </FinanceRow>)}</ul> : <span className="hint" style={{ display: "block" }}>الباقة فاضية. أضف بنودها من الأسفل.</span>}
          </FinanceRow>;
        })}</ul> : <p className="hint">الباقة تجمع بنود الرسوم بمبالغها وعدد أقساطها، مثل «باقة الروضة السنوية».</p>}
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <details><summary>إضافة باقة</summary><div style={{ marginTop: 12 }}><FinanceRecordForm organizationId={org} table="fee_plans" options={options} /></div></details>
          {planRows.length && itemRows.length ? <details><summary>إضافة بند لباقة</summary><div style={{ marginTop: 12 }}><FinanceRecordForm organizationId={org} table="fee_plan_items" options={options} /></div></details> : null}
        </div>
      </section>
      <section className="card"><h2>الخصومات</h2>
        {discountRows.length ? <ul className="records">{discountRows.map(discount => <FinanceRow key={discount.id} organizationId={org} table="discounts" record={discount}>
          <strong>{discount.name}</strong> <span className="chip-soft">{discountReasonLabels[discount.reason]}</span> {discount.is_active ? null : <span className="chip-soft rose">معطّل</span>}
          <span className="hint" style={{ display: "block" }}>{discount.kind === "percent" ? `${Number(discount.value).toLocaleString("ar-SA")}٪` : sar(discount.value)}</span>
        </FinanceRow>)}</ul> : <p className="hint">مثل خصم الإخوان أو أبناء الموظفين.</p>}
        <details style={{ marginTop: 16 }}><summary>إضافة خصم</summary><div style={{ marginTop: 12 }}><FinanceRecordForm organizationId={org} table="discounts" /></div></details>
      </section>
      {planRows.length && (gradeRows.length || sectionRows.length) ? <section className="card"><h2>إنشاء فواتير باقة لصف أو شعبة</h2>
        <p className="hint" style={{ marginBottom: 12 }}>تنشأ فاتورة لكل قسط لكل طالب، ويتوزّع المبلغ بالتساوي على الأقساط. ولي الأمر المربوط بالطالب يكون هو المدفوع منه.</p>
        <GenerateInvoicesForm organizationId={org} plans={options.plans}
          targets={[...gradeRows.map(grade => ({ id: `grade:${grade.id}`, name: `كل ${grade.name}` })), ...sectionRows.map(section => ({ id: `section:${section.id}`, name: sectionLabel(section, gradeRows) }))]}
          discounts={discountRows.filter(discount => discount.is_active).map(discount => ({ id: discount.id, name: discount.name }))} />
      </section> : null}
    </div>
  </>;
}
