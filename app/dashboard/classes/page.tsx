import Link from "next/link";
import { loadOrgContext } from "../../../lib/org-context";
import { OrgSwitcher, OrgUnavailable } from "../../../components/org-unavailable";
import { holidayOn, sectionGenderLabels, type Section } from "../../../lib/academics";
import { attendanceStatuses, isIsoDate, riyadhToday, type AttendanceStatus } from "../../../lib/students";
import { memberName, type Member } from "../../../lib/team";
import { LiveRefresh } from "../../../components/live-refresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "متابعة الفصول" };

type Counts = Record<AttendanceStatus, number>;
const empty = (): Counts => ({ present: 0, late: 0, absent: 0, excused: 0 });
const arabicDay = (day: string, style: "long" | "short" = "long") => new Date(day).toLocaleDateString("ar-SA", { timeZone: "UTC", weekday: style, day: "numeric", month: style === "long" ? "long" : "numeric" });
/** Present or late, as a share of students with a recorded status. */
function rate(counts: Counts): number | null {
  const recorded = counts.present + counts.late + counts.absent + counts.excused;
  return recorded ? Math.round(((counts.present + counts.late) / recorded) * 100) : null;
}

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ org?: string; day?: string }> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, organizations, userId } = context;
  const today = riyadhToday();
  const day = isIsoDate(params.day) && params.day <= today ? params.day : today;
  const weekStart = new Date(Date.parse(day) - 6 * 86400_000).toISOString().slice(0, 10);
  // One round of parallel queries; everything else is counted in memory.
  const [sections, grades, children, week, holidays, members] = await Promise.all([
    client.from("sections").select("id,grade_level_id,branch_id,name,gender,capacity,homeroom_teacher_id").eq("organization_id", org),
    client.from("grade_levels").select("id,name,sort_order").eq("organization_id", org).order("sort_order"),
    client.rpc("section_enrollment", { org }),
    client.rpc("section_attendance_summary", { org, from_day: weekStart, to_day: day }),
    client.from("holidays").select("name,starts_on,ends_on").eq("organization_id", org).lte("starts_on", day).gte("ends_on", day).limit(1),
    client.from("memberships").select("user_id,role,display_name").eq("organization_id", org),
  ]);
  const failed = sections.error || children.error || week.error;
  const sectionRows = (sections.data ?? []) as Section[];
  const gradeRows = (grades.data ?? []) as { id: string; name: string; sort_order: number }[];
  const enrollmentRows = (children.data ?? []) as { section_id: string | null; total: number }[];
  const enrolled = new Map(enrollmentRows.filter(row => row.section_id).map(row => [row.section_id as string, Number(row.total)]));
  const totalStudents = enrollmentRows.reduce((sum, row) => sum + Number(row.total), 0);
  const days = Array.from({ length: 7 }, (_, index) => new Date(Date.parse(weekStart) + index * 86400_000).toISOString().slice(0, 10));
  // counts[section][day] — "none" collects students without a section.
  const counts = new Map<string, Map<string, Counts>>();
  for (const row of (week.data ?? []) as { section_id: string | null; attendance_date: string; status: AttendanceStatus; total: number }[]) {
    const section = row.section_id ?? "none";
    if (!counts.has(section)) counts.set(section, new Map());
    const byDay = counts.get(section)!;
    if (!byDay.has(row.attendance_date)) byDay.set(row.attendance_date, empty());
    if (attendanceStatuses.includes(row.status)) byDay.get(row.attendance_date)![row.status] += Number(row.total);
  }
  const dayCounts = (section: string, target = day) => counts.get(section)?.get(target) ?? empty();
  const total = empty();
  for (const byDay of counts.values()) { const c = byDay.get(day); if (c) for (const status of attendanceStatuses) total[status] += c[status]; }
  const recordedToday = total.present + total.late + total.absent + total.excused;
  const holiday = holidayOn(day, (holidays.data ?? []) as { name: string; starts_on: string; ends_on: string }[]);
  const memberRows = (members.data ?? []) as Member[];
  const orgParam = encodeURIComponent(org);
  const shift = (offset: number) => new Date(Date.parse(day) + offset * 86400_000).toISOString().slice(0, 10);
  const ordered = [...sectionRows].sort((a, b) => {
    const ga = gradeRows.findIndex(grade => grade.id === a.grade_level_id), gb = gradeRows.findIndex(grade => grade.id === b.grade_level_id);
    return ga - gb || a.name.localeCompare(b.name, "ar");
  });
  return <>
    <header className="page-head">
      <div><h1>متابعة الفصول</h1><p>{orgName} — {day === today ? `اليوم، ${arabicDay(day)}` : arabicDay(day)}</p></div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {day === today ? <LiveRefresh organizationId={org} /> : null}
        <OrgSwitcher path="/dashboard/classes" current={org} organizations={organizations} extra={{ day }} />
      </div>
    </header>
    <form className="toolbar" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginBottom: 18 }}>
      <input type="hidden" name="org" value={org} />
      <label>اليوم<input type="date" name="day" max={today} defaultValue={day} /></label>
      <button type="submit" className="btn">عرض</button>
      <span style={{ display: "flex", gap: 16 }}>
        <Link href={`/dashboard/classes?org=${orgParam}&day=${shift(-1)}`}>اليوم السابق</Link>
        {day < today ? <Link href={`/dashboard/classes?org=${orgParam}&day=${shift(1)}`}>اليوم التالي</Link> : null}
      </span>
    </form>
    {holiday ? <p className="info-banner" style={{ marginBottom: 16 }}>هذا اليوم إجازة: {holiday}.</p> : null}
    {failed ? <p role="alert" className="info-banner">تعذر تحميل بيانات الفصول. أعد تحميل الصفحة.</p> : <>
      <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginBottom: 24 }}>
        <div className="stat lilac"><span className="label">الطلاب</span><span className="figure">{totalStudents.toLocaleString("ar-SA")}</span></div>
        <div className="stat mint"><span className="label">حاضر</span><span className="figure">{(total.present + total.late).toLocaleString("ar-SA")}{total.late ? <small> منهم {total.late.toLocaleString("ar-SA")} متأخر</small> : null}</span></div>
        <div className="stat rose"><span className="label">غائب</span><span className="figure">{(total.absent + total.excused).toLocaleString("ar-SA")}{total.excused ? <small> منهم {total.excused.toLocaleString("ar-SA")} بعذر</small> : null}</span></div>
        <div className="stat peach"><span className="label">ما تسجّل حضورهم</span><span className="figure">{Math.max(totalStudents - recordedToday, 0).toLocaleString("ar-SA")}</span></div>
        <div className="stat sky"><span className="label">نسبة الحضور</span><span className="figure">{rate(total) === null ? "—" : `${rate(total)!.toLocaleString("ar-SA")}٪`}</span></div>
      </div>
      {ordered.length ? <section className="card" aria-labelledby="classes-title">
        <h2 id="classes-title">الفصول</h2>
        <div className="table-wrap"><table className="links-table" style={{ width: "100%" }}>
          <thead><tr>
            <th scope="col">الفصل</th><th scope="col">العدد / المحدد</th><th scope="col">حاضر</th><th scope="col">متأخر</th><th scope="col">غائب</th><th scope="col">بعذر</th><th scope="col">ما تسجّل</th><th scope="col">النسبة</th><th scope="col">آخر ٧ أيام</th>
          </tr></thead>
          <tbody>{ordered.map(section => {
            const c = dayCounts(section.id);
            const size = enrolled.get(section.id) ?? 0;
            const unrecorded = Math.max(size - (c.present + c.late + c.absent + c.excused), 0);
            const share = rate(c);
            const teacher = memberRows.find(member => member.user_id === section.homeroom_teacher_id);
            const over = section.capacity !== null && size > section.capacity;
            return <tr key={section.id}>
              <td><Link href={day === today ? `/dashboard/classes/${section.id}?org=${orgParam}` : `/dashboard/attendance?org=${orgParam}&day=${day}&section=${section.id}`}><strong>{gradeRows.find(grade => grade.id === section.grade_level_id)?.name} — {section.name}</strong></Link>
                {day === today ? <Link className="chip-soft ok" style={{ marginInlineStart: 8, textDecoration: "none" }} href={`/dashboard/classes/${section.id}?org=${orgParam}`}>مباشر</Link> : null}
                <span className="hint" style={{ display: "block" }}>{[sectionGenderLabels[section.gender], teacher ? memberName(teacher, teacher.user_id === userId) : null].filter(Boolean).join(" · ")}</span></td>
              <td><span className={`chip-soft${over ? " rose" : ""}`}>{size.toLocaleString("ar-SA")}{section.capacity ? ` / ${section.capacity.toLocaleString("ar-SA")}` : ""}</span></td>
              <td>{c.present.toLocaleString("ar-SA")}</td><td>{c.late.toLocaleString("ar-SA")}</td><td>{c.absent.toLocaleString("ar-SA")}</td><td>{c.excused.toLocaleString("ar-SA")}</td>
              <td>{unrecorded ? <span className="chip-soft coral">{unrecorded.toLocaleString("ar-SA")}</span> : "—"}</td>
              <td style={{ minWidth: 90 }}>{share === null ? "—" : <><span>{share.toLocaleString("ar-SA")}٪</span><span className={`progress ${share >= 90 ? "leaf" : share >= 75 ? "" : "coral"}`} style={{ display: "block", marginTop: 4 }}><span style={{ width: `${share}%` }} /></span></>}</td>
              <td><span style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 28 }} role="img" aria-label={`الحضور في آخر ٧ أيام: ${days.map(target => `${arabicDay(target, "short")} ${rate(dayCounts(section.id, target)) ?? "بدون تسجيل"}`).join("، ")}`}>
                {days.map(target => { const value = rate(dayCounts(section.id, target)); return <span key={target} title={`${arabicDay(target, "short")}: ${value === null ? "بدون تسجيل" : `${value}٪`}`} style={{ width: 8, height: value === null ? 3 : Math.max(4, Math.round(value * 0.28)), borderRadius: 2, background: value === null ? "var(--border)" : value >= 90 ? "var(--leaf)" : value >= 75 ? "var(--sky)" : "var(--coral)" }} />; })}
              </span></td>
            </tr>;
          })}</tbody>
        </table></div>
        {dayCounts("none").present + dayCounts("none").absent + dayCounts("none").late + dayCounts("none").excused ? <p className="hint" style={{ marginTop: 12 }}>فيه حضور مسجّل لطلاب بدون فصل، وانحسب في الإجمالي فوق.</p> : null}
      </section> : <p className="empty">ما فيه فصول بعد. أضفها من <Link href={`/dashboard/academics?org=${orgParam}`}>الهيكل الدراسي</Link>، ووزّع الطلاب عليها.</p>}
    </>}
  </>;
}
