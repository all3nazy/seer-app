import Link from "next/link";
import { loadOrgContext } from "../../../lib/org-context";
import { OrgSwitcher, OrgUnavailable } from "../../../components/org-unavailable";
import { AttendanceSheet } from "../../../components/attendance-sheet";
import { isIsoDate, riyadhToday, type AttendanceRow } from "../../../lib/students";

export const dynamic = "force-dynamic";
export const metadata = { title: "الحضور" };
const limit = 500;

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ org?: string; day?: string; branch?: string }> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager, organizations } = context;
  const today = riyadhToday();
  const day = manager && isIsoDate(params.day) && params.day <= today ? params.day : today;
  const branchesResult = await client.from("branches").select("id,name").eq("organization_id", org).order("name").limit(200);
  const branches = (branchesResult.data ?? []) as { id: string; name: string }[];
  const branch = branches.some(item => item.id === params.branch) ? params.branch : undefined;
  let studentsQuery = client.from("children").select("id,full_name", { count: "exact" }).eq("organization_id", org);
  if (branch) studentsQuery = studentsQuery.eq("branch_id", branch);
  const { data: students, count, error } = await studentsQuery.order("full_name").limit(limit);
  const ids = (students ?? []).map(student => student.id as string);
  const [recordsResult, healthResult] = ids.length ? await Promise.all([
    client.from("attendance").select("child_id,status,note").eq("organization_id", org).eq("attendance_date", day).in("child_id", ids),
    client.from("child_health").select("child_id,allergies,conditions").eq("organization_id", org).in("child_id", ids),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  const alerts = new Set((healthResult.data ?? []).filter(row => row.allergies || row.conditions).map(row => row.child_id as string));
  const shift = (days: number) => new Date(Date.parse(day) + days * 86400_000).toISOString().slice(0, 10);
  const link = (target: string) => `/dashboard/attendance?${new URLSearchParams({ org, day: target, ...(branch ? { branch } : {}) })}`;
  const dayLabel = new Date(day).toLocaleDateString("ar-SA", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return <>
    <header className="page-head">
      <div><h1>الحضور</h1><p>{orgName} — {day === today ? `اليوم، ${dayLabel}` : dayLabel}</p></div>
      <OrgSwitcher path="/dashboard/attendance" current={org} organizations={organizations} />
    </header>
    <form className="toolbar" style={{ marginBottom: 18, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
      <input type="hidden" name="org" value={org} />
      {manager ? <label style={{ flex: "0 1 200px" }}>اليوم<input type="date" name="day" max={today} defaultValue={day} /></label> : null}
      {branches.length ? <label style={{ flex: "0 1 200px" }}>الفرع<select name="branch" defaultValue={branch ?? ""}><option value="">كل الفروع</option>{branches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
      {manager || branches.length ? <button type="submit" className="btn">عرض</button> : null}
      {manager ? <span style={{ display: "flex", gap: 16 }}><Link href={link(shift(-1))}>اليوم السابق</Link>{day < today ? <Link href={link(shift(1))}>اليوم التالي</Link> : null}</span> : null}
    </form>
    <section className="card">
      {error || recordsResult.error ? <p role="alert">تعذر تحميل كشف الحضور. أعد تحميل الصفحة.</p>
        : ids.length ? <>
          {(count ?? 0) > limit ? <p className="info-banner" style={{ marginBottom: 12 }}>يظهر أول {limit.toLocaleString("ar-SA")} طالب. اختر فرعًا لتقسيم الكشف.</p> : null}
          <AttendanceSheet key={`${org}:${day}:${branch ?? ""}`} organizationId={org} day={day} editable={day === today || manager}
            students={(students ?? []).map(student => ({ id: student.id as string, full_name: student.full_name as string, alert: alerts.has(student.id as string) }))}
            records={(recordsResult.data ?? []) as AttendanceRow[]} />
        </> : <p className="empty">ما فيه طلاب{branch ? " في هذا الفرع" : ""}. أضف الطلاب من <Link href={`/dashboard/children?org=${encodeURIComponent(org)}`}>صفحة الطلاب</Link>.</p>}
    </section>
  </>;
}
