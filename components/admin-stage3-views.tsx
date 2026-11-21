import Link from "next/link";
import { BlockIpForm, BroadcastComposer, CouponEditToggle, CouponEditor, InviteAdminForm, IssueInvoiceForm, ReleaseLockButton, TeamMemberActions, UnblockButton } from "./admin-stage3-forms";
import { PrintButton } from "./print-button";
import { Logo } from "./icons";
import { auditLabel, pageList, timeAgo } from "../lib/admin-format";
import { adminRoleLabels, adminRoleNotes, type AdminRole } from "../lib/admin-roles";
import { AUDIT_PER_PAGE, audienceText, auditDetail, auditHref, couponScope, couponState, couponValue, type AuditQuery, type Coupon } from "../lib/admin-stage3";
import { arNumber, formatDate, formatDateTime, formatDay } from "../lib/dates";
import { durationLabel, riyal } from "../lib/subscriptions";
import { operator } from "../lib/legal";

type Option = { id: string; name: string };

// Coupons -------------------------------------------------------------------------------------------
export type CouponUse = { payment_id: string; organization_id: string; organization: string; status: string; amount: number; discount: number; created_at: string; receipt: string | null };
const paymentStatus: Record<string, { label: string; tone: string }> = { approved: { label: "مؤكد", tone: "ok" }, pending: { label: "بانتظار التأكيد", tone: "sun" }, rejected: { label: "مرفوض", tone: "rose" } };

export function CouponsView({ coupons, plans, today, selected, uses }: { coupons: Coupon[]; plans: Option[]; today: string; selected?: string | null; uses?: CouponUse[] }) {
  const current = coupons.find(coupon => coupon.id === selected);
  return <div className="adm-page">
    <header className="page-head"><div><h1>الكوبونات والعروض</h1><p>كود يكتبه المشترك في صفحة التجديد، ويشوف السعر بعد الخصم قبل ما يحوّل.</p></div></header>
    <section className="card adm-card" aria-labelledby="cp-new"><h2 id="cp-new">كوبون جديد</h2><CouponEditor plans={plans} /></section>
    <section className="card adm-card" aria-labelledby="cp-list"><h2 id="cp-list">الكوبونات ({arNumber(coupons.length)})</h2>
      {coupons.length ? <ul className="adm-coupons">{coupons.map(coupon => {
        const state = couponState(coupon, today);
        return <li key={coupon.id} className="adm-coupon">
          <div className="adm-coupon-head">
            <strong dir="ltr">{coupon.code}</strong>
            <span className="chip-soft plum">خصم {couponValue(coupon)}</span>
            <span className={`chip-soft ${state.tone}`}>{state.label}</span>
          </div>
          <p className="hint" style={{ margin: 0 }}>{couponScope(coupon, plans)}
            {coupon.valid_from || coupon.valid_until ? ` · ${coupon.valid_from ? `من ${formatDay(coupon.valid_from, { year: true })}` : ""}${coupon.valid_until ? ` إلى ${formatDay(coupon.valid_until, { year: true })}` : ""}` : ""}</p>
          <p style={{ margin: 0 }}>استُخدم {arNumber(coupon.used)}{coupon.max_uses !== null ? ` من ${arNumber(coupon.max_uses)}` : ""}{coupon.pending ? ` · ${arNumber(coupon.pending)} بانتظار التأكيد` : ""}
            {coupon.max_per_org !== null ? ` · ${arNumber(coupon.max_per_org)} لكل منشأة` : ""} · مجموع الخصم {riyal(Number(coupon.discount_total))}</p>
          {coupon.note ? <p className="hint" style={{ margin: 0 }}>{coupon.note}</p> : null}
          <span className="adm-btn-row"><Link className="btn btn-sm" href={`/admin/coupons?coupon=${coupon.id}#uses`}>سجل الاستخدام<span className="sr-only"> {coupon.code}</span></Link></span>
          <CouponEditToggle coupon={coupon} plans={plans} />
        </li>;
      })}</ul> : <p className="empty">ما فيه كوبونات بعد. أضف أول كوبون من الأعلى.</p>}
    </section>
    {current ? <section className="card adm-card" id="uses" aria-labelledby="cp-uses"><h2 id="cp-uses">استخدام الكوبون <span dir="ltr">{current.code}</span></h2>
      {uses?.length ? <div className="table-wrap"><table className="links-table"><thead><tr><th scope="col">المنشأة</th><th scope="col">التحويل</th><th scope="col">الخصم</th><th scope="col">الحالة</th><th scope="col">الإيصال</th></tr></thead>
        <tbody>{uses.map(use => <tr key={use.payment_id}>
          <td><Link href={`/admin/subscribers/${use.organization_id}`}>{use.organization}</Link><span className="hint" style={{ display: "block" }}>{formatDate(use.created_at, { year: true })}</span></td>
          <td>{riyal(Number(use.amount))}</td><td>{riyal(Number(use.discount))}</td>
          <td><span className={`chip-soft ${paymentStatus[use.status]?.tone ?? ""}`}>{paymentStatus[use.status]?.label ?? use.status}</span></td>
          <td dir="ltr" style={{ textAlign: "end" }}>{use.receipt ?? "—"}</td>
        </tr>)}</tbody></table></div> : <p className="empty">ما استُخدم هذا الكوبون بعد.</p>}
    </section> : null}
  </div>;
}

// Invoices ------------------------------------------------------------------------------------------
export type InvoiceRow = { id: string; number: string; kind: "receipt" | "adjustment"; organization_id: string; organization: string; description: string; amount: number; discount: number; coupon_code: string | null; issued_at: string; total: number };
export const invoiceKinds: Record<string, string> = { receipt: "إيصال اشتراك", adjustment: "فاتورة تسوية" };

export function InvoiceTable({ rows, hrefFor, showOrg = true }: { rows: InvoiceRow[]; hrefFor: (row: InvoiceRow) => string; showOrg?: boolean }) {
  if (!rows.length) return <p className="empty">ما فيه فواتير أو إيصالات بعد.</p>;
  return <div className="table-wrap"><table className="links-table"><thead><tr><th scope="col">الرقم</th>{showOrg ? <th scope="col">المنشأة</th> : null}<th scope="col">النوع</th><th scope="col">الوصف</th><th scope="col">المبلغ</th><th scope="col">التاريخ</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.id}>
      <td dir="ltr" style={{ textAlign: "end" }}><Link href={hrefFor(row)}>{row.number}</Link></td>
      {showOrg ? <td><Link href={`/admin/subscribers/${row.organization_id}#billing`}>{row.organization}</Link></td> : null}
      <td><span className={`chip-soft ${row.kind === "receipt" ? "ok" : "plum"}`}>{invoiceKinds[row.kind]}</span></td>
      <td>{row.description}{row.coupon_code ? <span className="hint" style={{ display: "block" }}>كوبون <span dir="ltr">{row.coupon_code}</span> · خصم {riyal(Number(row.discount))}</span> : null}</td>
      <td>{riyal(Number(row.amount))}</td>
      <td>{formatDate(row.issued_at, { year: true })}</td>
    </tr>)}</tbody></table></div>;
}

export function InvoicesView({ rows, query, page }: { rows: InvoiceRow[]; query: { q: string; kind: string }; page: number }) {
  const total = Number(rows[0]?.total ?? 0);
  const last = Math.max(1, Math.ceil(total / 50));
  const href = (n: number) => { const params = new URLSearchParams(); if (query.q) params.set("q", query.q); if (query.kind) params.set("kind", query.kind); if (n > 1) params.set("page", String(n)); const text = params.toString(); return `/admin/invoices${text ? `?${text}` : ""}`; };
  return <div className="adm-page">
    <header className="page-head"><div><h1>الفواتير والإيصالات</h1><p>إيصال مرقّم لكل تحويل مؤكد، وفواتير التسوية اليدوية. لإصدار فاتورة افتح ملف المنشأة ← الاشتراك والفواتير.</p></div></header>
    <form className="adm-filters" role="search" aria-label="بحث في الفواتير">
      <label className="grow">بحث<input type="search" name="q" defaultValue={query.q} placeholder="رقم الفاتورة أو اسم المنشأة" /></label>
      <label>النوع<select name="kind" defaultValue={query.kind}><option value="">الكل</option><option value="receipt">إيصالات الاشتراك</option><option value="adjustment">فواتير التسوية</option></select></label>
      <button type="submit" className="btn btn-primary">عرض</button>
    </form>
    <p className="hint" style={{ margin: 0 }}>{total ? `${arNumber(total)} مستند` : ""}</p>
    <InvoiceTable rows={rows} hrefFor={row => `/admin/invoices/${row.id}`} />
    {last > 1 ? <nav className="adm-pager" aria-label="صفحات الفواتير">
      {page > 1 ? <Link href={href(page - 1)} rel="prev">السابقة</Link> : null}
      {pageList(page, last).map((item, index) => item === "…" ? <span key={`gap-${index}`} aria-hidden="true">…</span> : <Link key={item} href={href(item)} aria-current={item === page ? "page" : undefined} aria-label={`الصفحة ${arNumber(item)}`}>{arNumber(item)}</Link>)}
      {page < last ? <Link href={href(page + 1)} rel="next">التالية</Link> : null}
    </nav> : null}
  </div>;
}

/** The organization profile's invoices block, with «إصدار فاتورة» for finance and owners. */
export function OrgInvoices({ org, orgName, rows, canIssue }: { org: string; orgName: string; rows: InvoiceRow[] | null; canIssue: boolean }) {
  return <section className="card adm-card" aria-labelledby="bill-inv"><div className="adm-card-head"><h2 id="bill-inv">الفواتير والإيصالات</h2>{canIssue ? <IssueInvoiceForm org={org} orgName={orgName} /> : null}</div>
    {rows === null ? <p className="hint">الفواتير تظهر لفريق المالية.</p> : <InvoiceTable rows={rows} hrefFor={row => `/admin/invoices/${row.id}`} showOrg={false} />}
  </section>;
}

/** The printable receipt or invoice (Arabic, the operator from lib/legal, no VAT). Same for the owner and the admin. */
export type InvoiceDoc = { id: string; number: string; kind: "receipt" | "adjustment"; organization_name: string; description: string; plan_name: string | null; months: number | null;
  period_start: string | null; period_end: string | null; base_amount: number | null; discount: number; coupon_code: string | null; amount: number; reference: string | null; note: string | null; issued_at: string };
export function InvoiceDocument({ doc, back }: { doc: InvoiceDoc; back?: React.ReactNode }) {
  const base = doc.base_amount === null ? Number(doc.amount) : Number(doc.base_amount);
  return <article className="card sub-receipt adm-invoice" aria-labelledby="inv-title">
    {back ? <span className="no-print">{back}</span> : null}
    <header className="adm-invoice-head"><Logo /><span className="no-print"><PrintButton /></span></header>
    <div className="adm-invoice-title"><h1 id="inv-title">{doc.kind === "receipt" ? "إيصال اشتراك" : "فاتورة"}</h1><p dir="ltr">{doc.number}</p></div>
    <div className="adm-invoice-parties">
      <section aria-label="مقدّم الخدمة"><h2>من</h2><p><strong>منصة سِير</strong> — {operator.name}</p><p className="hint">{operator.status}</p><p className="hint">{operator.address}</p><p className="hint" dir="ltr" style={{ textAlign: "start" }}>{operator.email}</p></section>
      <section aria-label="العميل"><h2>إلى</h2><p><strong>{doc.organization_name}</strong></p><p className="hint">تاريخ الإصدار: {formatDate(doc.issued_at, { year: true })}</p>{doc.reference ? <p className="hint">مرجع التحويل: <span dir="ltr">{doc.reference}</span></p> : null}</section>
    </div>
    <div className="table-wrap"><table className="links-table adm-invoice-lines"><thead><tr><th scope="col">البيان</th><th scope="col">المبلغ</th></tr></thead>
      <tbody>
        <tr><td>{doc.description}{doc.months ? ` · ${durationLabel(doc.months)}` : ""}{doc.period_start && doc.period_end ? <span className="hint" style={{ display: "block" }}>الفترة: {formatDay(doc.period_start, { year: true })} ← {formatDay(doc.period_end, { year: true })}</span> : null}</td><td>{riyal(base)}</td></tr>
        {Number(doc.discount) ? <tr><td>خصم{doc.coupon_code ? <> بالكوبون <span dir="ltr">{doc.coupon_code}</span></> : ""}</td><td>− {riyal(Number(doc.discount))}</td></tr> : null}
      </tbody>
      <tfoot><tr><th scope="row">الإجمالي</th><td><strong>{riyal(Number(doc.amount))}</strong></td></tr></tfoot>
    </table></div>
    {doc.note ? <p style={{ margin: 0 }}>ملاحظة: {doc.note}</p> : null}
    <p className="hint" style={{ margin: 0 }}>المبالغ بالريال السعودي. لا تشمل ضريبة القيمة المضافة: مقدّم الخدمة غير مسجّل فيها.</p>
    <p className="hint" style={{ margin: 0 }}>{doc.kind === "receipt" ? "استلمنا المبلغ بالتحويل البنكي، وهذا الإيصال صادر آليًا عند تأكيده." : "صادرة من فريق سِير."}</p>
  </article>;
}

// Broadcast -----------------------------------------------------------------------------------------
export type BroadcastRow = { id: string; title: string; body: string; link: string | null; audience: { status?: string; plan?: string | null; orgs?: string[] }; managers: boolean; email: boolean;
  organizations: number; notified: number; emailed: number; created_at: string; created_by: string | null };
export function BroadcastView({ history, plans, orgs, now = Date.now() }: { history: BroadcastRow[]; plans: Option[]; orgs: Option[]; now?: number }) {
  return <div className="adm-page">
    <header className="page-head"><div><h1>رسالة للمشتركين</h1><p>إشعار داخل المنصة لملاك المنشآت (والمدراء إذا تبي)، وبريد لمن عنده بريد حقيقي. تنرسل مرة وحدة حتى لو ضغطت مرتين.</p></div></header>
    <BroadcastComposer plans={plans} orgs={orgs} />
    <section className="card adm-card" aria-labelledby="bc-history"><h2 id="bc-history">الرسائل السابقة</h2>
      {history.length ? <ul className="adm-list">{history.map(item => <li key={item.id} style={{ alignItems: "flex-start" }}>
        <span style={{ flex: 1 }}><strong>{item.title}</strong><span className="hint" style={{ display: "block" }}>{audienceText(item.audience, item.managers, plans)}{item.created_by ? ` · ${item.created_by}` : ""}</span>
          <span className="adm-clamp">{item.body}</span></span>
        <span className="hint" style={{ textAlign: "end" }}>{arNumber(item.notified)} إشعار · {arNumber(item.emailed)} بريد<span style={{ display: "block" }} title={formatDateTime(item.created_at)}>{timeAgo(item.created_at, now)}</span></span>
      </li>)}</ul> : <p className="empty">ما انرسلت رسائل بعد.</p>}
    </section>
  </div>;
}

// Login security ------------------------------------------------------------------------------------
export type SecurityData = {
  window: "24h" | "7d";
  locks: { id: number; scope: "account" | "ip"; subject: string; ip: string | null; failures: number; locked_until: string; created_at: string; active: boolean }[];
  top_ips: { ip: string; failures: number; accounts: number; last_at: string; blocked: boolean }[];
  failures: number; successes: number;
  blocks: { id: number; ip: string; reason: string; expires_at: string | null; created_at: string; by: string | null; active: boolean; removed_at: string | null }[];
};
export function SecurityView({ data, blockIp = "" }: { data: SecurityData | null; blockIp?: string }) {
  const windowLabel = data?.window === "7d" ? "آخر ٧ أيام" : "آخر ٢٤ ساعة";
  return <div className="adm-page">
    <header className="page-head"><div><h1>أمان الدخول</h1><p>الأقفال التلقائية بعد المحاولات الفاشلة، وأكثر العناوين فشلًا، وقائمة الحظر اليدوي.</p></div></header>
    <nav className="segments" aria-label="المدة"><Link href="/admin/security" aria-current={data?.window !== "7d" ? "page" : undefined}>٢٤ ساعة</Link><Link href="/admin/security?window=7d" aria-current={data?.window === "7d" ? "page" : undefined}>٧ أيام</Link></nav>
    {!data ? <p className="card hint">ما قدرت أقرأ بيانات الأمان (تأكد من تطبيق ترحيل المرحلة الثالثة).</p> : <>
      <section className="card adm-numbers" aria-label={`أرقام ${windowLabel}`}>
        <div><p className="label">دخول ناجح</p><p className="figure">{arNumber(data.successes)}</p><p className="sub">{windowLabel}</p></div>
        <div><p className="label">محاولات فاشلة</p><p className="figure">{arNumber(data.failures)}</p></div>
        <div><p className="label">أقفال</p><p className="figure">{arNumber(data.locks.length)}</p><p className="sub">{arNumber(data.locks.filter(lock => lock.active).length)} نشط الحين</p></div>
        <div><p className="label">عناوين محظورة</p><p className="figure">{arNumber(data.blocks.filter(block => block.active).length)}</p></div>
      </section>
      <section className="card adm-card" aria-labelledby="sec-locks"><h2 id="sec-locks">الأقفال ({windowLabel})</h2>
        {data.locks.length ? <div className="table-wrap"><table className="links-table"><thead><tr><th scope="col">النوع</th><th scope="col">الحساب أو العنوان</th><th scope="col">محاولات</th><th scope="col">بدأ</th><th scope="col">الحالة</th><th scope="col"><span className="sr-only">إجراء</span></th></tr></thead>
          <tbody>{data.locks.map(lock => <tr key={lock.id}>
            <td>{lock.scope === "account" ? "حساب" : "IP"}</td>
            <td dir="ltr" style={{ textAlign: "end" }}>{lock.subject}{lock.scope === "account" && lock.ip ? <span className="hint" style={{ display: "block" }}>{lock.ip}</span> : null}</td>
            <td>{arNumber(lock.failures)}</td><td>{formatDateTime(lock.created_at)}</td>
            <td><span className={`chip-soft ${lock.active ? "rose" : ""}`}>{lock.active ? `مقفل حتى ${formatDateTime(lock.locked_until)}` : "انتهى"}</span></td>
            <td>{lock.active ? <ReleaseLockButton id={lock.id} label={lock.subject} /> : null}</td>
          </tr>)}</tbody></table></div> : <p className="empty">ما فيه أقفال خلال {windowLabel}.</p>}
      </section>
      <section className="card adm-card" aria-labelledby="sec-ips"><h2 id="sec-ips">أكثر العناوين فشلًا</h2>
        {data.top_ips.length ? <div className="table-wrap"><table className="links-table"><thead><tr><th scope="col">IP</th><th scope="col">محاولات فاشلة</th><th scope="col">حسابات مختلفة</th><th scope="col">آخر محاولة</th><th scope="col"><span className="sr-only">حظر</span></th></tr></thead>
          <tbody>{data.top_ips.map(row => <tr key={row.ip}>
            <td dir="ltr" style={{ textAlign: "end" }}>{row.ip}</td><td>{arNumber(row.failures)}</td><td>{arNumber(row.accounts)}</td><td>{formatDateTime(row.last_at)}</td>
            <td>{row.blocked ? <span className="chip-soft rose">محظور</span> : <Link className="btn btn-sm" href={`/admin/security?${data.window === "7d" ? "window=7d&" : ""}block=${encodeURIComponent(row.ip)}#block`}>حظر<span className="sr-only"> {row.ip}</span></Link>}</td>
          </tr>)}</tbody></table></div> : <p className="empty">ما فيه محاولات فاشلة خلال {windowLabel}.</p>}
      </section>
      <section className="card adm-card" id="block" aria-labelledby="sec-block"><h2 id="sec-block">قائمة الحظر</h2>
        <p className="hint" style={{ marginTop: 0 }}>العنوان المحظور ما يقدر يسجّل دخول أبدًا (أي حساب) حتى تنتهي المدة أو ترفع الحظر.</p>
        <BlockIpForm key={blockIp} initialIp={blockIp} />
        {data.blocks.length ? <ul className="adm-list">{data.blocks.map(block => <li key={block.id}>
          <span style={{ flex: 1 }}><strong dir="ltr">{block.ip}</strong> <span className={`chip-soft ${block.active ? "rose" : ""}`}>{block.active ? "محظور" : block.removed_at ? "انرفع" : "انتهى"}</span>
            <span className="hint" style={{ display: "block" }}>{block.reason} · {block.expires_at ? `حتى ${formatDateTime(block.expires_at)}` : "بدون مدة"}{block.by ? ` · ${block.by}` : ""}</span></span>
          {block.active ? <UnblockButton id={block.id} ip={block.ip} /> : null}
        </li>)}</ul> : <p className="empty">ما فيه عناوين محظورة.</p>}
      </section>
    </>}
  </div>;
}
// The operations log --------------------------------------------------------------------------------
export type AuditRow = { id: number; created_at: string; actor_id: string | null; actor: string | null; action: string; organization_id: string | null; organization: string | null; detail: Record<string, unknown> | null; total: number };
export function AuditView({ rows, query, filters, orgs }: { rows: AuditRow[]; query: AuditQuery; filters: { actors: { id: string; email: string }[]; actions: string[] }; orgs: Option[] }) {
  const total = Number(rows[0]?.total ?? 0);
  const last = Math.max(1, Math.ceil(total / AUDIT_PER_PAGE));
  return <div className="adm-page">
    <header className="page-head"><div><h1>سجل العمليات</h1><p>كل إجراء من فريق الإدارة (من اللوحة أو من تيليقرام): من، وش، على أي منشأة، ومتى.</p></div>
      <a className="btn" href={auditHref(query, 1, "/admin/audit/export")} download>تصدير CSV</a></header>
    <form className="adm-filters" role="search" aria-label="تصفية السجل">
      <label>من الفريق<select name="actor" defaultValue={query.actor}><option value="">الكل</option>{filters.actors.map(actor => <option key={actor.id} value={actor.id}>{actor.email}</option>)}</select></label>
      <label>العملية<select name="action" defaultValue={query.action}><option value="">كل العمليات</option>{filters.actions.map(action => <option key={action} value={action}>{auditLabel(action)}</option>)}</select></label>
      <label>المنشأة<select name="org" defaultValue={query.org}><option value="">كل المنشآت</option>{orgs.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
      <label>من تاريخ<input type="date" name="from" defaultValue={query.from} /></label>
      <label>إلى تاريخ<input type="date" name="to" defaultValue={query.to} /></label>
      <button type="submit" className="btn btn-primary">عرض</button>
    </form>
    <p className="hint" style={{ margin: 0 }}>{total ? `${arNumber(total)} عملية` : ""}</p>
    {rows.length ? <div className="table-wrap"><table className="links-table"><thead><tr><th scope="col">الوقت</th><th scope="col">العملية</th><th scope="col">المنشأة</th><th scope="col">من</th><th scope="col">التفاصيل</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <td>{formatDateTime(row.created_at)}</td>
        <td>{auditLabel(row.action)}</td>
        <td>{row.organization_id && row.organization ? <Link href={`/admin/subscribers/${row.organization_id}`}>{row.organization}</Link> : "—"}</td>
        <td dir="ltr" style={{ textAlign: "end" }}>{row.actor ?? "—"}</td>
        <td className="hint adm-detail">{auditDetail(row.detail) || "—"}</td>
      </tr>)}</tbody></table></div> : <p className="empty">ما فيه عمليات مطابقة.</p>}
    {last > 1 ? <nav className="adm-pager" aria-label="صفحات السجل">
      {query.page > 1 ? <Link href={auditHref(query, query.page - 1)} rel="prev">السابقة</Link> : null}
      {pageList(query.page, last).map((item, index) => item === "…" ? <span key={`gap-${index}`} aria-hidden="true">…</span> : <Link key={item} href={auditHref(query, item)} aria-current={item === query.page ? "page" : undefined} aria-label={`الصفحة ${arNumber(item)}`}>{arNumber(item)}</Link>)}
      {query.page < last ? <Link href={auditHref(query, query.page + 1)} rel="next">التالية</Link> : null}
    </nav> : null}
  </div>;
}

// Team ----------------------------------------------------------------------------------------------
export type TeamRow = { user_id: string; email: string; role: AdminRole; created_at: string; last_sign_in_at: string | null; mfa: boolean | null; invited_by: string | null; is_me: boolean };
export function TeamView({ team, now = Date.now() }: { team: TeamRow[]; now?: number }) {
  return <div className="adm-page">
    <header className="page-head"><div><h1>فريق الإدارة</h1><p>من يدخل «سِير أدمن» وبأي دور. لازم يبقى مالك واحد على الأقل.</p></div></header>
    <section className="card adm-card" aria-labelledby="tm-roles"><h2 id="tm-roles">الأدوار</h2>
      <ul className="adm-list">{(["owner", "support", "finance"] as AdminRole[]).map(role => <li key={role}><strong style={{ minWidth: 56 }}>{adminRoleLabels[role]}</strong><span className="hint">{adminRoleNotes[role]}</span></li>)}</ul>
    </section>
    <section className="card adm-card" aria-labelledby="tm-add"><h2 id="tm-add">إضافة عضو</h2><InviteAdminForm /></section>
    <section className="card adm-card" aria-labelledby="tm-list"><h2 id="tm-list">الفريق ({arNumber(team.length)})</h2>
      <div className="table-wrap"><table className="links-table"><thead><tr><th scope="col">الحساب</th><th scope="col">الدور</th><th scope="col">التحقق الثنائي</th><th scope="col">آخر دخول</th><th scope="col"><span className="sr-only">إجراءات</span></th></tr></thead>
        <tbody>{team.map(member => <tr key={member.user_id}>
          <td dir="ltr" style={{ textAlign: "end" }}>{member.email}{member.invited_by ? <span className="hint" style={{ display: "block" }}>أضافه {member.invited_by}</span> : null}</td>
          <td><span className={`chip-soft ${member.role === "owner" ? "coral" : member.role === "finance" ? "ok" : "plum"}`}>{adminRoleLabels[member.role]}</span></td>
          <td>{member.mfa === null ? "—" : member.mfa ? <span className="chip-soft ok">مفعّل</span> : <span className="chip-soft sun">يُطلب عند أول دخول</span>}</td>
          <td>{member.last_sign_in_at ? timeAgo(member.last_sign_in_at, now) : "ما دخل بعد"}</td>
          <td><TeamMemberActions user={member.user_id} email={member.email} role={member.role} me={member.is_me} /></td>
        </tr>)}</tbody></table></div>
    </section>
  </div>;
}
