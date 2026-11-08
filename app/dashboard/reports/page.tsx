import Link from "next/link";
import { loadOrgContext } from "../../../lib/org-context";
import { OrgUnavailable } from "../../../components/org-unavailable";
import { PrintButton } from "../../../components/print-button";
import { ageing, attendanceBySection, monthRange, staffSummary, type OpenInvoice, type SectionDay, type StaffDay } from "../../../lib/reports";
import { riyadhToday } from "../../../lib/students";
import { sar } from "../../../lib/finance";

export const dynamic = "force-dynamic";
export const metadata = { title: "تقارير الإدارة" };

/** One page with the month's picture: class attendance, fees collected and owed, and staff attendance. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ org?: string; month?: string }> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager } = context;
  if (!manager) return <section className="card"><h1>تقارير الإدارة</h1><p>التقارير لمالك المنشأة أو مديرها.</p></section>;
  const today = riyadhToday();
  const month = params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : today.slice(0, 7);
  const { from, to } = monthRange(month);
  const [summary, enrolled, sections, grades, issued, collected, open, staff, staffDays] = await Promise.all([
    client.rpc("section_attendance_summary", { org, from_day: from, to_day: to }),
    client.rpc("section_enrollment", { org }),
    client.from("sections").select("id,name,grade_level_id").eq("organization_id", org),
    client.from("grade_levels").select("id,name").eq("organization_id", org),
    client.from("invoices").select("amount_sar").eq("organization_id", org).in("status", ["issued", "paid"]).gte("issue_date", from).lte("issue_date", to).limit(10000),
    client.from("payments").select("amount").eq("organization_id", org).gte("paid_on", from).lte("paid_on", to).limit(10000),
    client.from("invoices").select("amount_sar,paid_total,due_date").eq("organization_id", org).eq("status", "issued").limit(10000),
    client.from("staff_profiles").select("id,full_name").eq("organization_id", org).eq("status", "active").order("full_name"),
    client.from("staff_attendance").select("staff_id,status").eq("organization_id", org).gte("work_date", from).lte("work_date", to).limit(10000),
  ]);
  const gradeName = new Map(((grades.data ?? []) as { id: string; name: string }[]).map(row => [row.id, row.name]));
  const sectionName = new Map(((sections.data ?? []) as { id: string; name: string; grade_level_id: string }[]).map(row => [row.id, `${gradeName.get(row.grade_level_id) ?? ""} — ${row.name}`]));
  const enrolledMap = new Map(((enrolled.data ?? []) as { section_id: string | null; total: number }[]).map(row => [row.section_id, Number(row.total)]));
  const classes = attendanceBySection(((summary.data ?? []) as SectionDay[]), enrolledMap).sort((a, b) => (sectionName.get(a.section ?? "") ?? "ي").localeCompare(sectionName.get(b.section ?? "") ?? "ي", "ar"));
  const totals = classes.reduce((sum, row) => ({ present: sum.present + row.present + row.late, recorded: sum.recorded + row.recorded }), { present: 0, recorded: 0 });
  const issuedTotal = ((issued.data ?? []) as { amount_sar: number }[]).reduce((sum, row) => sum + Number(row.amount_sar), 0);
  const collectedTotal = ((collected.data ?? []) as { amount: number }[]).reduce((sum, row) => sum + Number(row.amount), 0);
  const owed = ageing((open.data ?? []) as OpenInvoice[], today);
  const staffRows = (staff.data ?? []) as { id: string; full_name: string }[];
  const staffStats = staffSummary((staffDays.data ?? []) as StaffDay[]);
  const shift = (delta: number) => { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + delta, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const monthLabel = new Date(`${month}-15T00:00:00Z`).toLocaleDateString("ar-SA-u-ca-gregory", { month: "long", year: "numeric", timeZone: "UTC" });
  const orgParam = encodeURIComponent(org);
  const pct = (value: number | null) => value === null ? "—" : `${value.toLocaleString("ar-SA")}٪`;
  return <div className="reports">
    <header className="page-head"><div><h1>تقارير الإدارة</h1><p>{orgName} — {monthLabel}</p></div>
      <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Link className="btn btn-sm" href={`/dashboard/reports?org=${orgParam}&month=${shift(-1)}`}>الشهر السابق</Link>
        {month < today.slice(0, 7) ? <Link className="btn btn-sm" href={`/dashboard/reports?org=${orgParam}&month=${shift(1)}`}>الشهر التالي</Link> : null}
        <PrintButton />
      </div>
    </header>
    <div className="stats">
      <div className="stat sky"><span className="figure">{pct(totals.recorded ? Math.round((totals.present / totals.recorded) * 1000) / 10 : null)}</span><span className="label">نسبة الحضور هذا الشهر</span></div>
      <div className="stat peach"><span className="figure">{sar(collectedTotal)}</span><span className="label">المحصّل هذا الشهر من {sar(issuedTotal)} صادر</span></div>
      <div className="stat"><span className="figure">{sar(owed.total)}</span><span className="label">المستحق على الأهالي الآن</span></div>
    </div>
    <section className="card" style={{ marginTop: 16 }}><h2>الحضور حسب الفصل</h2>
      <div className="table-wrap"><table className="links-table"><thead><tr><th>الفصل</th><th>الطلاب</th><th>حاضر</th><th>متأخر</th><th>غائب</th><th>بعذر</th><th>النسبة</th></tr></thead>
        <tbody>{classes.map(row => <tr key={row.section ?? "none"}><td>{row.section ? sectionName.get(row.section) ?? "فصل" : "بدون فصل"}</td><td>{row.students.toLocaleString("ar-SA")}</td><td>{row.present.toLocaleString("ar-SA")}</td><td>{row.late.toLocaleString("ar-SA")}</td><td>{row.absent.toLocaleString("ar-SA")}</td><td>{row.excused.toLocaleString("ar-SA")}</td>
          <td><span className={`chip-soft ${row.rate === null ? "" : row.rate >= 90 ? "ok" : row.rate >= 75 ? "sky" : "rose"}`}>{pct(row.rate)}</span></td></tr>)}</tbody></table></div>
    </section>
    <section className="card" style={{ marginTop: 16 }}><h2>المستحقات حسب التأخير</h2>
      <div className="table-wrap"><table className="links-table"><thead><tr><th>لم يحن موعدها</th><th>متأخرة حتى ٣٠ يومًا</th><th>٣١–٦٠ يومًا</th><th>٦١–٩٠ يومًا</th><th>أكثر من ٩٠ يومًا</th><th>الإجمالي</th></tr></thead>
        <tbody><tr><td>{sar(owed.notDue)}</td><td>{sar(owed.d30)}</td><td>{sar(owed.d60)}</td><td>{sar(owed.d90)}</td><td><strong>{sar(owed.older)}</strong></td><td><strong>{sar(owed.total)}</strong></td></tr></tbody></table></div>
      <p className="hint no-print" style={{ marginTop: 8 }}><Link href={`/dashboard/finance?org=${orgParam}`}>تفاصيل الفواتير في المالية</Link></p>
    </section>
    {staffRows.length ? <section className="card" style={{ marginTop: 16 }}><h2>حضور الموظفين</h2>
      <div className="table-wrap"><table className="links-table"><thead><tr><th>الموظف</th><th>حاضر</th><th>متأخر</th><th>غائب</th><th>إجازة</th></tr></thead>
        <tbody>{staffRows.map(row => { const s = staffStats.get(row.id) ?? { present: 0, late: 0, absent: 0, leave: 0 }; return <tr key={row.id}><td>{row.full_name}</td><td>{s.present.toLocaleString("ar-SA")}</td><td>{s.late.toLocaleString("ar-SA")}</td><td>{s.absent ? <strong>{s.absent.toLocaleString("ar-SA")}</strong> : "٠"}</td><td>{s.leave.toLocaleString("ar-SA")}</td></tr>; })}</tbody></table></div>
    </section> : null}
  </div>;
}
