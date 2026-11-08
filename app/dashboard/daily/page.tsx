import Link from "next/link";
import { loadOrgContext } from "../../../lib/org-context";
import { OrgSwitcher, OrgUnavailable } from "../../../components/org-unavailable";
import { DailyReportCard } from "../../../components/family-forms";
import { sectionLabel } from "../../../lib/academics";
import { isIsoDate, riyadhToday } from "../../../lib/students";
import type { DailyReport } from "../../../lib/family";

export const dynamic = "force-dynamic";
export const metadata = { title: "التقرير اليومي" };

export default async function DailyPage({ searchParams }: { searchParams: Promise<{ org?: string; day?: string; section?: string }> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager, organizations } = context;
  const today = riyadhToday();
  const day = manager && isIsoDate(params.day) && params.day <= today ? params.day : today;
  const [sectionsResult, gradesResult, orgRow] = await Promise.all([
    client.from("sections").select("id,name,grade_level_id").eq("organization_id", org).order("name"),
    client.from("grade_levels").select("id,name").eq("organization_id", org).order("sort_order"),
    client.from("organizations").select("type").eq("id", org).maybeSingle(),
  ]);
  const grades = (gradesResult.data ?? []) as { id: string; name: string }[];
  const sections = ((sectionsResult.data ?? []) as { id: string; name: string; grade_level_id: string }[]).map(item => ({ id: item.id, name: sectionLabel(item, grades) }));
  const section = sections.find(item => item.id === params.section)?.id ?? sections[0]?.id;
  let studentsQuery = client.from("children").select("id,full_name").eq("organization_id", org).order("full_name").limit(300);
  if (section) studentsQuery = studentsQuery.eq("section_id", section);
  const { data: students } = await studentsQuery;
  const ids = (students ?? []).map(row => row.id as string);
  const safeIds = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
  const [reports, health, links] = await Promise.all([
    client.from("daily_reports").select("child_id,report_date,mood,breakfast,lunch,snack,nap_minutes,diapers,activities,medication,incident,notes").eq("organization_id", org).eq("report_date", day).in("child_id", safeIds),
    client.from("child_health").select("child_id,allergies,conditions").eq("organization_id", org).in("child_id", safeIds),
    client.from("child_guardians").select("child_id,relationship,guardians(phone)").eq("organization_id", org).in("child_id", safeIds),
  ]);
  const byChild = new Map(((reports.data ?? []) as DailyReport[]).map(row => [row.child_id, row]));
  const alerts = new Set((health.data ?? []).filter(row => row.allergies || row.conditions).map(row => row.child_id as string));
  const phones = new Map<string, string>();
  for (const row of (links.data ?? []) as unknown as { child_id: string; relationship: string; guardians: { phone: string | null } | null }[]) {
    if (row.guardians?.phone && (!phones.has(row.child_id) || row.relationship === "mother")) phones.set(row.child_id, row.guardians.phone);
  }
  const orgParam = encodeURIComponent(org);
  const done = ids.filter(id => byChild.has(id)).length;
  const type = (orgRow.data as { type: string } | null)?.type;
  return <>
    <header className="page-head">
      <div><h1>التقرير اليومي</h1><p>{orgName} — يوم كل طفل: المزاج والأكل والنوم والأنشطة، ويوصل لأهله بالواتساب وفي بوابة ولي الأمر.</p></div>
      <OrgSwitcher path="/dashboard/daily" current={org} organizations={organizations} extra={{ day }} />
    </header>
    <form className="toolbar" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginBottom: 16 }}>
      <input type="hidden" name="org" value={org} />
      {sections.length ? <label>الفصل<select name="section" defaultValue={section}>{sections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
      {manager ? <label>اليوم<input type="date" name="day" max={today} defaultValue={day} /></label> : null}
      <button type="submit" className="btn">عرض</button>
      <span className="chip-soft ok">{done.toLocaleString("ar-SA")} من {ids.length.toLocaleString("ar-SA")} مكتمل</span>
    </form>
    {!sections.length ? <p className="info-banner">أضف الفصول من <Link href={`/dashboard/academics?org=${orgParam}`}>الهيكل الدراسي</Link> لعرض الأطفال حسب الفصل.</p> : null}
    {ids.length ? <div className="daily-grid">{(students ?? []).map(student => <DailyReportCard key={`${student.id}-${day}`} organizationId={org} day={day}
      child={{ id: student.id as string, full_name: student.full_name as string, alert: alerts.has(student.id as string) }} report={byChild.get(student.id as string) ?? null}
      editable={day === today || manager} guardianPhone={phones.get(student.id as string) ?? null} showDiapers={type !== "school"} />)}</div>
      : <p className="empty">ما فيه أطفال في هذا الفصل.</p>}
  </>;
}
