import Link from "next/link";
import { setupPercent, type SetupRow } from "../lib/onboarding";
import { dayCount, listHref, pageList, PER_PAGE, sortOptions, statusFilters, statusPill, type SubscriberQuery } from "../lib/admin-format";
import { arNumber, formatDay } from "../lib/dates";
import { orgTypeLabels } from "../lib/org-invites";

export type SubscriberRow = { organization_id: string; name: string; type: string; city: string | null; plan: string | null; status: string | null; access: string; ends_on: string | null; days_left: number | null; owner_email: string | null; owner_phone: string | null; students: number; staff: number; pending: number; total: number };
export { listHref, PER_PAGE, sortOptions, statusFilters, type SubscriberQuery } from "../lib/admin-format";

/** «المنشآت»: search, filters, sort and pages (25 each). */
export function SubscribersView({ rows, plans, query, setup }: { rows: SubscriberRow[]; plans: { id: string; name: string }[]; query: SubscriberQuery; setup: Map<string, SetupRow> }) {
  const total = Number(rows[0]?.total ?? 0);
  const last = Math.max(1, Math.ceil(total / PER_PAGE));
  return <div className="adm-page">
    <header className="page-head"><div><h1>المنشآت</h1><p>{total ? `${arNumber(total)} منشأة${query.q || query.status || query.plan || query.ending ? " مطابقة" : ""}` : "ما فيه منشآت مطابقة"}</p></div></header>
    <form className="adm-filters" role="search" aria-label="بحث وتصفية المنشآت">
      <label className="grow">بحث<input type="search" name="q" defaultValue={query.q} placeholder="اسم المنشأة، المدينة، بريد المالك أو جواله" /></label>
      <label>الحالة<select name="status" defaultValue={query.status}>{statusFilters.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>الباقة<select name="plan" defaultValue={query.plan}><option value="">كل الباقات</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
      <label>الترتيب<select name="sort" defaultValue={query.sort}>{sortOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="quote-check" style={{ flex: "0 0 auto" }}><input type="checkbox" name="ending" value="1" defaultChecked={query.ending} /> <span>تنتهي خلال ١٤ يوم</span></label>
      <button type="submit" className="btn btn-primary">عرض</button>
    </form>
    {rows.length ? <div className="table-wrap"><table className="links-table"><thead><tr><th scope="col">المنشأة</th><th scope="col">الباقة</th><th scope="col">الحالة</th><th scope="col">النهاية</th><th scope="col">التأسيس</th><th scope="col">الطلاب</th><th scope="col">الفريق</th><th scope="col">التواصل</th></tr></thead>
      <tbody>{rows.map(row => {
        const pill = statusPill(row.status, row.access);
        const progress = setup.get(row.organization_id);
        return <tr key={row.organization_id}>
          <td><Link href={`/admin/subscribers/${row.organization_id}`}>{row.name}</Link>
            <span className="hint" style={{ display: "block" }}>{[orgTypeLabels[row.type] ?? row.type, row.city].filter(Boolean).join(" · ")}</span>
            {Number(row.pending) ? <span className="chip-soft rose">تحويل معلّق</span> : null}</td>
          <td>{row.plan ?? "—"}</td>
          <td><span className={`chip-soft ${pill.tone}`}>{pill.label}</span></td>
          <td>{row.ends_on ? formatDay(row.ends_on, { year: true }) : "—"}{row.days_left !== null && row.days_left >= 0 ? <span className="hint" style={{ display: "block" }}>باقي {dayCount(row.days_left)}</span> : null}</td>
          <td>{progress ? <span className={`chip-soft ${setupPercent(progress) === 100 ? "ok" : progress.stuck ? "rose" : ""}`}>{arNumber(setupPercent(progress))}٪{progress.stuck ? " · متعثرة" : ""}</span> : "—"}</td>
          <td>{arNumber(Number(row.students))}</td><td>{arNumber(Number(row.staff))}</td>
          <td dir="ltr" className="hint" style={{ textAlign: "end" }}>{[row.owner_phone, row.owner_email].filter(Boolean).join(" · ") || "—"}</td>
        </tr>;
      })}</tbody></table></div> : <p className="empty">ما لقيت منشآت بهالبحث. جرّب كلمة ثانية أو امسح التصفية.</p>}
    {last > 1 ? <nav className="adm-pager" aria-label="صفحات المنشآت">
      {query.page > 1 ? <Link href={listHref(query, query.page - 1)} rel="prev">السابقة</Link> : null}
      {pageList(query.page, last).map((item, index) => item === "…" ? <span key={`gap-${index}`} aria-hidden="true">…</span>
        : <Link key={item} href={listHref(query, item)} aria-current={item === query.page ? "page" : undefined} aria-label={`الصفحة ${arNumber(item)}`}>{arNumber(item)}</Link>)}
      {query.page < last ? <Link href={listHref(query, query.page + 1)} rel="next">التالية</Link> : null}
    </nav> : null}
  </div>;
}
