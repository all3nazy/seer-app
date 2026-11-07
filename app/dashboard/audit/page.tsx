import Link from "next/link";
import { loadOrgContext } from "../../../lib/org-context";
import { OrgSwitcher, OrgUnavailable } from "../../../components/org-unavailable";
import { applyAuditFilters, auditActionLabels, auditEntityLabels, auditFilters, type AuditEvent } from "../../../lib/audit";
import { memberName, type Member } from "../../../lib/team";

export const dynamic = "force-dynamic";
export const metadata = { title: "سجل التدقيق" };
const pageSize = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager, organizations, userId } = context;
  if (!manager) return <section className="card"><h1>سجل التدقيق</h1><p>سجل التدقيق لمسؤولي المنشأة فقط.</p><Link href="/dashboard">العودة للوحة التشغيل</Link></section>;
  const filters = auditFilters(params);
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 10000 ? requestedPage : 1;
  const [eventsResult, membersResult] = await Promise.all([
    applyAuditFilters(client.from("audit_events").select("id,actor_id,entity,record_id,action,created_at", { count: "exact" }).eq("organization_id", org), filters)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1),
    client.from("memberships").select("user_id,role,display_name").eq("organization_id", org),
  ]);
  const members = (membersResult.data ?? []) as Member[];
  const actor = (id: string | null) => id ? memberName(members.find(member => member.user_id === id), id === userId) : "النظام";
  const events = (eventsResult.data ?? []) as AuditEvent[];
  const total = eventsResult.count ?? 0;
  const query = (extra: Record<string, string>) => new URLSearchParams({ org, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) as Record<string, string>, ...extra }).toString();
  const recordLink = (event: AuditEvent) => event.action !== "DELETE" && ["children", "child_health", "child_guardians"].includes(event.entity)
    ? `/dashboard/children/${event.record_id}?org=${encodeURIComponent(org)}` : null;
  return <>
    <header className="page-head">
      <div><h1>سجل التدقيق</h1><p>كل إضافة وتعديل وحذف في {orgName}. يحفظ السجل نوع العملية ومنفذها فقط، بدون أسماء الطلاب أو بياناتهم.</p></div>
      <OrgSwitcher path="/dashboard/audit" current={org} organizations={organizations} />
    </header>
    <form className="composer" style={{ marginBottom: 18 }} aria-label="تصفية السجل">
      <input type="hidden" name="org" value={org} />
      <label>القسم<select name="entity" defaultValue={filters.entity ?? ""}><option value="">كل الأقسام</option>{Object.entries(auditEntityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>العملية<select name="action" defaultValue={filters.action ?? ""}><option value="">كل العمليات</option>{Object.entries(auditActionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>المنفّذ<select name="actor" defaultValue={filters.actor ?? ""}><option value="">الكل</option>{members.map(member => <option key={member.user_id} value={member.user_id}>{memberName(member, member.user_id === userId)}</option>)}</select></label>
      <label>من<input type="date" name="from" defaultValue={filters.from ?? ""} /></label>
      <label>إلى<input type="date" name="to" defaultValue={filters.to ?? ""} /></label>
      <button type="submit" className="btn-primary">تصفية</button>
    </form>
    <section className="card">
      {eventsResult.error ? <p role="alert">تعذر تحميل سجل التدقيق. أعد تحميل الصفحة.</p> : <>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <p className="hint">{total.toLocaleString("ar-SA")} عملية</p>
          {total ? <a href={`/dashboard/audit/export?${query({})}`} download>تحميل ملف جدول (CSV)</a> : null}
        </div>
        {events.length ? <div className="table-wrap"><table className="links-table" style={{ width: "100%" }}>
          <thead><tr><th scope="col">الوقت</th><th scope="col">القسم</th><th scope="col">العملية</th><th scope="col">المنفّذ</th><th scope="col"><span className="sr-only">السجل</span></th></tr></thead>
          <tbody>{events.map(event => {
            const href = recordLink(event);
            return <tr key={event.id}>
              <td>{new Date(event.created_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" })}</td>
              <td>{auditEntityLabels[event.entity] ?? event.entity}</td>
              <td><span className={`chip-soft ${event.action === "DELETE" ? "rose" : event.action === "INSERT" ? "ok" : ""}`}>{auditActionLabels[event.action] ?? event.action}</span></td>
              <td>{actor(event.actor_id)}</td>
              <td>{href ? <Link href={href}>فتح الملف</Link> : null}</td>
            </tr>;
          })}</tbody>
        </table></div> : <p className="empty">ما فيه عمليات مطابقة.</p>}
        <nav aria-label="صفحات السجل" style={{ display: "flex", gap: 24, marginTop: 16 }}>
          {page > 1 ? <Link href={`/dashboard/audit?${query({ page: String(page - 1) })}`}>الصفحة السابقة</Link> : null}
          {page * pageSize < total ? <Link href={`/dashboard/audit?${query({ page: String(page + 1) })}`}>الصفحة التالية</Link> : null}
        </nav>
      </>}
    </section>
  </>;
}
