import Link from "next/link";
import { requestSession } from "../../../lib/supabase/server";
import { accessLabels, statusLabels, type Access } from "../../../lib/subscriptions";

export const metadata = { title: "المشتركين" };
type Row = { organization_id: string; name: string; type: string; plan: string | null; status: string | null; access: Access; ends_on: string | null; days_left: number | null; owner_email: string | null; owner_phone: string | null; students: number; staff: number; pending: number };
const filters: [string, string][] = [["", "الكل"], ["active", "نشط"], ["trial", "تجربة"], ["grace", "مهلة"], ["locked", "مقفل"]];

export default async function AdminSubscribers({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 60);
  const status = filters.some(([key]) => key === params.status) ? params.status ?? "" : "";
  const { client } = await requestSession();
  const { data } = await client.rpc("admin_subscribers", { search: q || null, filter: status || null });
  const rows = (data ?? []) as Row[];
  return <>
    <header className="page-head"><div><h1>المشتركين</h1><p>{rows.length.toLocaleString("ar-SA")} منشأة</p></div></header>
    <form className="toolbar" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginBottom: 16 }}>
      <label style={{ flex: "1 1 220px" }}>بحث بالاسم<input type="search" name="q" defaultValue={q} /></label>
      <label>الحالة<select name="status" defaultValue={status}>{filters.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button type="submit" className="btn">عرض</button>
    </form>
    <div className="table-wrap"><table className="links-table"><thead><tr><th>المنشأة</th><th>الباقة</th><th>الحالة</th><th>النهاية</th><th>الطلاب</th><th>الفريق</th><th>التواصل</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.organization_id}>
        <td><Link href={`/admin/subscribers/${row.organization_id}`}>{row.name}</Link>{row.pending ? <span className="chip-soft rose"> تحويل معلّق</span> : null}</td>
        <td>{row.plan ?? "—"}</td>
        <td><span className={`chip-soft ${row.access === "locked" ? "rose" : row.access === "grace" ? "" : "ok"}`}>{row.status === "trial" && row.access === "active" ? statusLabels.trial : row.status === "suspended" ? statusLabels.suspended : accessLabels[row.access]}</span></td>
        <td>{row.ends_on ?? "—"}{row.days_left !== null && row.days_left >= 0 ? <span className="hint"> ({row.days_left.toLocaleString("ar-SA")} يوم)</span> : null}</td>
        <td>{Number(row.students).toLocaleString("ar-SA")}</td><td>{Number(row.staff).toLocaleString("ar-SA")}</td>
        <td dir="ltr" className="hint">{[row.owner_phone, row.owner_email].filter(Boolean).join(" · ") || "—"}</td>
      </tr>)}</tbody></table></div>
  </>;
}
