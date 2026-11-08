import Link from "next/link";
import { loadOrgContext } from "../../../lib/org-context";
import { OrgSwitcher, OrgUnavailable } from "../../../components/org-unavailable";
import { AssessmentForm, BehaviorForm, DeleteLearning, GradeSheet, SubjectForm, TimetableCell } from "../../../components/learning-forms";
import { sectionLabel } from "../../../lib/academics";
import { assessmentLabels, behaviorLabels, weekdays, type Assessment, type BehaviorCategory } from "../../../lib/learning";
import { memberName, type Member } from "../../../lib/team";

export const dynamic = "force-dynamic";
export const metadata = { title: "الدراسة" };
const tabs = { timetable: "الجدول", grades: "الدرجات", behavior: "السلوك", subjects: "المواد" } as const;
type Tab = keyof typeof tabs;
const periods = [1, 2, 3, 4, 5, 6, 7];

export default async function LearningPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager, organizations, userId } = context;
  const tab: Tab = params.tab && params.tab in tabs ? params.tab as Tab : "timetable";
  const orgParam = encodeURIComponent(org);
  const [sectionsResult, gradesResult, subjectsResult, membersResult] = await Promise.all([
    client.from("sections").select("id,name,grade_level_id").eq("organization_id", org).order("name"),
    client.from("grade_levels").select("id,name").eq("organization_id", org).order("sort_order"),
    client.from("subjects").select("id,name,grade_level_id,weekly_periods").eq("organization_id", org).order("name"),
    client.from("memberships").select("user_id,role,display_name").eq("organization_id", org),
  ]);
  const grades = (gradesResult.data ?? []) as { id: string; name: string }[];
  const sectionRows = (sectionsResult.data ?? []) as { id: string; name: string; grade_level_id: string }[];
  const sections = sectionRows.map(item => ({ id: item.id, name: sectionLabel(item, grades), grade: item.grade_level_id }));
  const section = sections.find(item => item.id === params.section) ?? sections[0];
  const allSubjects = (subjectsResult.data ?? []) as { id: string; name: string; grade_level_id: string | null; weekly_periods: number }[];
  const subjects = allSubjects.filter(subject => !subject.grade_level_id || subject.grade_level_id === section?.grade);
  const teachers = ((membersResult.data ?? []) as Member[]).map(member => ({ id: member.user_id, name: memberName(member, member.user_id === userId) }));
  const nav = <>
    <header className="page-head">
      <div><h1>الدراسة</h1><p>جدول {orgName} الأسبوعي، والتقييمات والدرجات، والسلوك، وشهادات الطلاب.</p></div>
      <OrgSwitcher path="/dashboard/learning" current={org} organizations={organizations} extra={{ tab }} />
    </header>
    <nav className="segments" aria-label="أقسام الدراسة" style={{ marginBottom: 14 }}>{(Object.keys(tabs) as Tab[]).map(key => <Link key={key} href={`/dashboard/learning?org=${orgParam}&tab=${key}${section ? `&section=${section.id}` : ""}`} aria-current={key === tab ? "page" : undefined}>{tabs[key]}</Link>)}</nav>
    {tab !== "subjects" && sections.length ? <form className="toolbar" style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginBottom: 16 }}>
      <input type="hidden" name="org" value={org} /><input type="hidden" name="tab" value={tab} />
      <label>الفصل<select name="section" defaultValue={section?.id}>{sections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {tab === "grades" ? <label>المادة<select name="subject" defaultValue={params.subject}>{subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
      <button type="submit" className="btn">عرض</button>
    </form> : null}
  </>;
  if (!sections.length && tab !== "subjects") return <>{nav}<p className="info-banner">أضف الصفوف والفصول من <Link href={`/dashboard/academics?org=${orgParam}`}>الهيكل الدراسي</Link> أولًا.</p></>;

  if (tab === "subjects") return <>{nav}
    {manager ? <section className="card" style={{ marginBottom: 16 }}><h2>إضافة مادة</h2><SubjectForm organizationId={org} grades={grades} /></section> : null}
    <section className="card">{allSubjects.length ? <ul className="records">{allSubjects.map(subject => <li key={subject.id}>
      <span><strong>{subject.name}</strong> · {subject.grade_level_id ? grades.find(grade => grade.id === subject.grade_level_id)?.name : "كل الصفوف"} · {subject.weekly_periods.toLocaleString("ar-SA")} حصص أسبوعيًا</span>
      {manager ? <DeleteLearning organizationId={org} table="subjects" id={subject.id} /> : null}</li>)}</ul> : <p className="empty">ما فيه مواد بعد.</p>}</section>
  </>;

  if (tab === "timetable") {
    const { data } = await client.from("timetable_slots").select("weekday,period,subject_id,teacher_id").eq("section_id", section!.id);
    const slots = (data ?? []) as { weekday: number; period: number; subject_id: string; teacher_id: string | null }[];
    const placed = new Map<string, number>();
    for (const slot of slots) placed.set(slot.subject_id, (placed.get(slot.subject_id) ?? 0) + 1);
    return <>{nav}
      <section className="card"><div className="table-wrap"><table className="timetable">
        <thead><tr><th>اليوم</th>{periods.map(period => <th key={period}>الحصة {period.toLocaleString("ar-SA")}</th>)}</tr></thead>
        <tbody>{weekdays.map(([day, label]) => <tr key={day}><th>{label}</th>{periods.map(period => { const slot = slots.find(item => item.weekday === day && item.period === period);
          return <td key={period}><TimetableCell organizationId={org} sectionId={section!.id} weekday={day} period={period} subjectId={slot?.subject_id ?? null} teacherId={slot?.teacher_id ?? null}
            subjects={subjects} teachers={teachers} editable={manager}
            label={{ subject: slot ? allSubjects.find(subject => subject.id === slot.subject_id)?.name ?? null : null, teacher: slot?.teacher_id ? teachers.find(teacher => teacher.id === slot.teacher_id)?.name ?? null : null }} /></td>; })}</tr>)}</tbody>
      </table></div>
      {subjects.length ? <p className="hint" style={{ marginTop: 12 }}>الحصص الموزّعة: {subjects.map(subject => `${subject.name} ${(placed.get(subject.id) ?? 0).toLocaleString("ar-SA")}/${subject.weekly_periods.toLocaleString("ar-SA")}`).join(" · ")}</p> : <p className="hint">أضف المواد من تبويب «المواد».</p>}
      {manager ? <p className="hint">اضغط أي خانة لاختيار المادة والمعلم. المنصة تمنع إسناد معلم لحصتين بنفس الوقت.</p> : null}</section>
    </>;
  }

  const { data: studentRows } = await client.from("children").select("id,full_name").eq("organization_id", org).eq("section_id", section!.id).order("full_name");
  const students = ((studentRows ?? []) as { id: string; full_name: string }[]).map(row => ({ id: row.id, name: row.full_name }));

  if (tab === "behavior") {
    const ids = students.length ? students.map(student => student.id) : ["00000000-0000-0000-0000-000000000000"];
    const { data } = await client.from("behavior_notes").select("id,child_id,kind,category,note,points,created_at,created_by").eq("organization_id", org).in("child_id", ids).order("created_at", { ascending: false }).limit(100);
    const notes = (data ?? []) as { id: string; child_id: string; kind: string; category: BehaviorCategory; note: string | null; points: number; created_at: string; created_by: string | null }[];
    const totals = new Map<string, number>();
    for (const note of notes) totals.set(note.child_id, (totals.get(note.child_id) ?? 0) + note.points);
    const ranked = [...students].sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0));
    return <>{nav}
      <div className="home-grid">
        <section className="card"><h2>تسجيل سلوك</h2>{students.length ? <BehaviorForm organizationId={org} students={students} /> : <p className="hint">ما فيه طلاب في الفصل.</p>}
          <h3 className="section-label" style={{ marginTop: 18 }}>لوحة النجوم</h3>
          <ol className="star-board">{ranked.slice(0, 10).map(student => <li key={student.id}><span>{student.name}</span><strong className={(totals.get(student.id) ?? 0) < 0 ? "neg" : ""}>{(totals.get(student.id) ?? 0) > 0 ? "⭐ " : ""}{(totals.get(student.id) ?? 0).toLocaleString("ar-SA")}</strong></li>)}</ol></section>
        <section className="card"><h2>آخر الملاحظات</h2>{notes.length ? <ul className="records">{notes.map(note => <li key={note.id}>
          <span>{note.kind === "positive" ? "⭐" : "⚠️"} <strong>{students.find(student => student.id === note.child_id)?.name}</strong> · {behaviorLabels[note.category]} ({note.points > 0 ? "+" : ""}{note.points.toLocaleString("ar-SA")}){note.note ? <span className="hint" style={{ display: "block" }}>{note.note}</span> : null}</span>
          {manager || note.created_by === userId ? <DeleteLearning organizationId={org} table="behavior_notes" id={note.id} /> : null}</li>)}</ul> : <p className="empty">ما فيه ملاحظات بعد.</p>}</section>
      </div>
    </>;
  }

  const subject = subjects.find(item => item.id === params.subject) ?? subjects[0];
  if (!subject) return <>{nav}<p className="info-banner">أضف مواد لهذا الصف من تبويب «المواد».</p></>;
  const [assessmentsResult, termsResult] = await Promise.all([
    client.from("assessments").select("id,subject_id,title,kind,max_score,weight,due_date,term_id,created_by").eq("section_id", section!.id).eq("subject_id", subject.id).order("due_date", { ascending: false, nullsFirst: false }),
    client.from("academic_terms").select("id,name,starts_on").eq("organization_id", org).order("starts_on"),
  ]);
  const assessments = (assessmentsResult.data ?? []) as (Assessment & { created_by: string | null })[];
  const current = assessments.find(item => item.id === params.assessment) ?? assessments[0];
  const { data: gradeRows } = current ? await client.from("grades").select("child_id,score,absent").eq("assessment_id", current.id) : { data: [] };
  const gradeMap = Object.fromEntries(((gradeRows ?? []) as { child_id: string; score: number | null; absent: boolean }[]).map(row => [row.child_id, { score: row.score === null ? null : Number(row.score), absent: row.absent }]));
  const totalWeight = assessments.reduce((sum, item) => sum + Number(item.weight), 0);
  const base = `/dashboard/learning?org=${orgParam}&tab=grades&section=${section!.id}&subject=${subject.id}`;
  return <>{nav}
    <div className="grades-layout">
      <section className="card"><h2>تقييمات {subject.name}</h2>
        <p className="hint">مجموع الأوزان {totalWeight.toLocaleString("ar-SA")} من ١٠٠{totalWeight > 100 ? " — تجاوز ١٠٠، راجع الأوزان" : ""}</p>
        {assessments.length ? <ul className="assessment-list">{assessments.map(item => <li key={item.id} aria-current={item.id === current?.id ? "true" : undefined}>
          <Link href={`${base}&assessment=${item.id}`}><strong>{item.title}</strong><small>{assessmentLabels[item.kind]} · من {Number(item.max_score).toLocaleString("ar-SA")} · وزن {Number(item.weight).toLocaleString("ar-SA")}٪</small></Link>
          {manager || item.created_by === userId ? <DeleteLearning organizationId={org} table="assessments" id={item.id} label="×" /> : null}
        </li>)}</ul> : <p className="hint">ما فيه تقييمات بعد.</p>}
        <details style={{ marginTop: 12 }} open={!assessments.length}><summary>تقييم جديد</summary><div style={{ marginTop: 10 }}><AssessmentForm organizationId={org} sectionId={section!.id} subjectId={subject.id} terms={((termsResult.data ?? []) as { id: string; name: string }[])} /></div></details>
      </section>
      <section className="card">{current ? <>
        <div className="section-head"><h2>{current.title}</h2><a className="btn btn-sm" href={`/dashboard/learning/export?org=${orgParam}&assessment=${current.id}`}>تصدير CSV (نور)</a></div>
        {students.length ? <GradeSheet key={current.id} organizationId={org} assessmentId={current.id} maxScore={Number(current.max_score)} students={students} grades={gradeMap} /> : <p className="hint">ما فيه طلاب في الفصل.</p>}
      </> : <p className="empty">أضف تقييمًا لإدخال الدرجات.</p>}
        <p className="hint" style={{ marginTop: 12 }}>شهادة كل طالب: من ملف الطالب ← «الشهادة»، أو <Link href={`/dashboard/learning/report?org=${orgParam}&section=${section!.id}`}>شهادات الفصل كاملة</Link>.</p>
      </section>
    </div>
  </>;
}
