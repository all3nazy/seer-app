import Link from "next/link";
import { loadOrgContext } from "../../../../lib/org-context";
import { OrgUnavailable } from "../../../../components/org-unavailable";
import { PrintButton } from "../../../../components/print-button";
import { loadProfile } from "../../../../lib/documents-server";
import { onColor } from "../../../../lib/documents";
import { sectionLabel } from "../../../../lib/academics";
import { gradeTone, gradeWord, overall, subjectResults, type Assessment, type Grade } from "../../../../lib/learning";

export const dynamic = "force-dynamic";
export const metadata = { title: "الشهادات" };

/** Printable report cards for a class (or one student), in the school's branding. */
export default async function ReportCardsPage({ searchParams }: { searchParams: Promise<{ org?: string; section?: string; child?: string; term?: string }> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName } = context;
  const orgParam = encodeURIComponent(org);
  let sectionId = params.section;
  if (params.child && !sectionId) { const { data } = await client.from("children").select("section_id").eq("organization_id", org).eq("id", params.child).maybeSingle(); sectionId = (data?.section_id as string | null) ?? undefined; }
  if (!sectionId) return <section className="card"><h1>الشهادات</h1><p>اختر الفصل من <Link href={`/dashboard/learning?org=${orgParam}&tab=grades`}>الدرجات</Link>.</p></section>;
  const [sectionRow, gradesResult, termsResult, studentsResult, subjectsResult, profile] = await Promise.all([
    client.from("sections").select("id,name,grade_level_id").eq("organization_id", org).eq("id", sectionId).maybeSingle(),
    client.from("grade_levels").select("id,name").eq("organization_id", org),
    client.from("academic_terms").select("id,name,starts_on,ends_on").eq("organization_id", org).order("starts_on"),
    params.child ? client.from("children").select("id,full_name,national_id").eq("organization_id", org).eq("id", params.child) : client.from("children").select("id,full_name,national_id").eq("organization_id", org).eq("section_id", sectionId).order("full_name"),
    client.from("subjects").select("id,name").eq("organization_id", org),
    loadProfile(client, org, orgName),
  ]);
  const terms = (termsResult.data ?? []) as { id: string; name: string; starts_on: string; ends_on: string }[];
  const term = terms.find(item => item.id === params.term);
  const students = (studentsResult.data ?? []) as { id: string; full_name: string; national_id: string | null }[];
  const ids = students.length ? students.map(student => student.id) : ["00000000-0000-0000-0000-000000000000"];
  // A student's grades follow them: assessments from an earlier section still count after a move.
  const { data: earned } = await client.from("grades").select("assessment_id").eq("organization_id", org).in("child_id", ids).limit(20000);
  const earnedIds = [...new Set(((earned ?? []) as { assessment_id: string }[]).map(row => row.assessment_id))];
  const columns = "id,subject_id,title,kind,max_score,weight,due_date,term_id";
  let sectionQuery = client.from("assessments").select(columns).eq("organization_id", org).eq("section_id", sectionId);
  let earnedQuery = client.from("assessments").select(columns).eq("organization_id", org).in("id", earnedIds.length ? earnedIds : ["00000000-0000-0000-0000-000000000000"]);
  if (term) { sectionQuery = sectionQuery.eq("term_id", term.id); earnedQuery = earnedQuery.eq("term_id", term.id); }
  const [sectionAssessments, earnedAssessments] = await Promise.all([sectionQuery, earnedQuery]);
  const assessments = [...new Map([...(sectionAssessments.data ?? []), ...(earnedAssessments.data ?? [])].map(row => [row.id as string, row])).values()] as Assessment[];
  const assessmentIds = assessments.length ? assessments.map(item => item.id) : ["00000000-0000-0000-0000-000000000000"];
  const from = term?.starts_on ?? "1900-01-01", to = term?.ends_on ?? "2999-12-31";
  const [gradeRows, attendanceRows, behaviorRows] = await Promise.all([
    client.from("grades").select("assessment_id,child_id,score,absent").in("assessment_id", assessmentIds).in("child_id", ids).limit(20000),
    client.from("attendance").select("child_id,status").eq("organization_id", org).in("child_id", ids).gte("attendance_date", from).lte("attendance_date", to).limit(20000),
    client.from("behavior_notes").select("child_id,points").eq("organization_id", org).in("child_id", ids).gte("created_at", from).lte("created_at", `${to}T23:59:59Z`).limit(20000),
  ]);
  const gradesList = ((gradeRows.data ?? []) as Grade[]).map(row => ({ ...row, score: row.score === null ? null : Number(row.score) }));
  const subjectName = new Map(((subjectsResult.data ?? []) as { id: string; name: string }[]).map(row => [row.id, row.name]));
  const section = sectionRow.data as { id: string; name: string; grade_level_id: string } | null;
  const sectionTitle = section ? sectionLabel(section, (gradesResult.data ?? []) as { id: string; name: string }[]) : "";
  const brand = profile.brand_color;
  return <div className="report-cards">
    <form className="toolbar no-print" style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginBottom: 16 }}>
      <input type="hidden" name="org" value={org} /><input type="hidden" name="section" value={sectionId} />{params.child ? <input type="hidden" name="child" value={params.child} /> : null}
      <label>الفصل الدراسي<select name="term" defaultValue={term?.id ?? ""}><option value="">كل التقييمات</option>{terms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button type="submit" className="btn">عرض</button><PrintButton />
    </form>
    {students.map(student => {
      const results = subjectResults(assessments, gradesList, student.id);
      const total = overall(results);
      const att = ((attendanceRows.data ?? []) as { child_id: string; status: string }[]).filter(row => row.child_id === student.id);
      const present = att.filter(row => row.status === "present" || row.status === "late").length;
      const stars = ((behaviorRows.data ?? []) as { child_id: string; points: number }[]).filter(row => row.child_id === student.id).reduce((sum, row) => sum + row.points, 0);
      return <article key={student.id} className="fdoc report-card" style={{ ["--brand" as string]: brand, ["--on-brand" as string]: onColor(brand) }}>
        <header className="fdoc-head">
          <div className="fdoc-org">{profile.logo_data ? <img src={profile.logo_data} alt="" className="fdoc-logo" /> : <span className="fdoc-monogram">{profile.name.charAt(0)}</span>}
            <div><strong>{profile.legal_name ?? profile.name}</strong><span>شهادة {term?.name ?? "التحصيل الدراسي"}</span></div></div>
          <div className="fdoc-title"><span>{sectionTitle}</span><strong>{student.full_name}</strong></div>
        </header>
        <table className="fdoc-lines" style={{ marginTop: 18 }}>
          <thead><tr><th>المادة</th><th>النسبة</th><th>التقدير</th></tr></thead>
          <tbody>{results.map(result => <tr key={result.subject_id}><td>{subjectName.get(result.subject_id) ?? "مادة"}</td>
            <td>{result.percent === null ? "—" : `${result.percent.toLocaleString("ar-SA")}٪`}{result.percent !== null ? <span className="grade-bar" style={{ ["--p" as string]: `${result.percent}%` }} /> : null}</td>
            <td><span className={`chip-soft ${gradeTone(result.percent)}`}>{gradeWord(result.percent)}</span></td></tr>)}
            {!results.length ? <tr><td colSpan={3} className="fdoc-muted">ما فيه تقييمات مسجّلة.</td></tr> : null}</tbody>
        </table>
        <div className="fdoc-bottom">
          <div className="fdoc-side"><div className="fdoc-bank"><span>الحضور</span><b>{present.toLocaleString("ar-SA")} من {att.length.toLocaleString("ar-SA")} يوم مسجّل</b><span>نقاط السلوك: {stars > 0 ? "⭐ " : ""}{stars.toLocaleString("ar-SA")}</span></div></div>
          <dl className="fdoc-totals"><dt className="grand">المعدل العام</dt><dd className="grand">{total === null ? "—" : `${total.toLocaleString("ar-SA")}٪`}</dd><dt>التقدير</dt><dd>{gradeWord(total)}</dd></dl>
        </div>
        <footer className="fdoc-foot report-sign"><span>رائد الفصل: ............</span><span>مدير المدرسة: ............</span><span>الختم</span></footer>
      </article>;
    })}
    {!students.length ? <p className="empty">ما فيه طلاب.</p> : null}
  </div>;
}
