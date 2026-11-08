import Link from "next/link";
import { notFound } from "next/navigation";
import { loadOrgContext } from "../../../../../lib/org-context";
import { OrgUnavailable } from "../../../../../components/org-unavailable";
import { AcademicForm, AcademicRow, AssignStudents } from "../../../../../components/academic-forms";
import { sectionGenderLabels, sectionLabel, type GradeLevel, type Section } from "../../../../../lib/academics";
import { uuid } from "../../../../../lib/operations";
import { memberName, type Member } from "../../../../../lib/team";

export const dynamic = "force-dynamic";
export const metadata = { title: "الشعبة" };

export default async function SectionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ org?: string }> }) {
  const [{ id: rawId }, { org: requestedOrg }] = await Promise.all([params, searchParams]);
  let id: string;
  try { id = uuid(rawId); } catch { notFound(); }
  const context = await loadOrgContext(requestedOrg);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, manager, userId } = context;
  const { data: section, error } = await client.from("sections").select("id,grade_level_id,branch_id,name,gender,capacity,homeroom_teacher_id").eq("organization_id", org).eq("id", id).maybeSingle();
  if (error) return <section className="card"><h1>تعذر تحميل الشعبة</h1><p role="alert">أعد تحميل الصفحة.</p></section>;
  if (!section) notFound();
  const row = section as Section;
  const [grades, students, unassigned, staff, members, branches] = await Promise.all([
    client.from("grade_levels").select("id,name,stage,sort_order").eq("organization_id", org).order("sort_order"),
    client.from("children").select("id,full_name").eq("organization_id", org).eq("status", "active").eq("section_id", id).order("full_name").limit(500),
    manager ? client.from("children").select("id,full_name").eq("organization_id", org).eq("status", "active").is("section_id", null).order("full_name").limit(500) : Promise.resolve({ data: [], error: null }),
    client.from("section_staff").select("id,user_id,duty").eq("organization_id", org).eq("section_id", id),
    client.from("memberships").select("user_id,role,display_name").eq("organization_id", org),
    client.from("branches").select("id,name").eq("organization_id", org).order("name").limit(200),
  ]);
  const gradeRows = (grades.data ?? []) as GradeLevel[];
  const memberRows = (members.data ?? []) as Member[];
  const name = (user: string | null) => memberName(memberRows.find(member => member.user_id === user), user === userId);
  const studentRows = (students.data ?? []) as { id: string; full_name: string }[];
  const orgParam = encodeURIComponent(org);
  const options = { grades: gradeRows.map(grade => ({ id: grade.id, name: grade.name })), branches: (branches.data ?? []) as { id: string; name: string }[], members: memberRows.map(member => ({ id: member.user_id, name: name(member.user_id) })), sections: [{ id, name: row.name }] };
  return <div style={{ display: "grid", gap: 24 }}>
    <header className="page-head" style={{ marginBottom: 0 }}>
      <div>
        <p className="hint"><Link href={`/dashboard/academics?org=${orgParam}`}>الهيكل الدراسي</Link> / الشعبة</p>
        <h1>{sectionLabel(row, gradeRows)}</h1>
        <p>{[sectionGenderLabels[row.gender], row.homeroom_teacher_id ? `الرائد: ${name(row.homeroom_teacher_id)}` : "بدون رائد", `${studentRows.length.toLocaleString("ar-SA")}${row.capacity ? ` من ${row.capacity.toLocaleString("ar-SA")}` : ""} طالب`].join(" · ")}</p>
      </div>
      <Link className="btn" href={`/dashboard/attendance?org=${orgParam}&section=${id}`}>كشف حضور الشعبة</Link>
    </header>
    {manager ? <section className="card"><details><summary>تعديل الشعبة</summary><div style={{ marginTop: 12 }}><AcademicForm organizationId={org} table="sections" record={row} options={options} /></div></details></section> : null}
    <section className="card" aria-labelledby="students-title">
      <h2 id="students-title">الطلاب</h2>
      {studentRows.length ? <ul className="records">{studentRows.map(student => <li key={student.id}><Link href={`/dashboard/children/${student.id}?org=${orgParam}`}>{student.full_name}</Link></li>)}</ul> : <p className="hint">ما فيه طلاب في هذه الشعبة بعد.</p>}
      {manager ? <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <details><summary>إضافة طلاب للشعبة</summary><div style={{ marginTop: 12 }}><AssignStudents organizationId={org} sectionId={id} mode="add" students={((unassigned.data ?? []) as { id: string; full_name: string }[]).map(child => ({ id: child.id, name: child.full_name }))} /></div></details>
        {studentRows.length ? <details><summary>إخراج طلاب من الشعبة</summary><div style={{ marginTop: 12 }}><AssignStudents organizationId={org} sectionId={id} mode="remove" students={studentRows.map(child => ({ id: child.id, name: child.full_name }))} /></div></details> : null}
        <p className="hint">قائمة الإضافة تعرض الطلاب اللي ما عندهم شعبة. لنقل طالب من شعبة ثانية، أخرجه منها أولًا أو عدّل ملفه.</p>
      </div> : null}
    </section>
    <section className="card" aria-labelledby="staff-title">
      <h2 id="staff-title">الكادر</h2>
      {(staff.data ?? []).length ? <ul className="records">{((staff.data ?? []) as { id: string; user_id: string; duty: string | null }[]).map(item => {
        const content = <>{name(item.user_id)}{item.duty ? <span className="chip-soft" style={{ marginInlineStart: 8 }}>{item.duty}</span> : null}</>;
        return manager ? <AcademicRow key={item.id} organizationId={org} table="section_staff" record={item}>{content}</AcademicRow> : <li key={item.id}><span>{content}</span></li>;
      })}</ul> : <p className="hint">ما فيه معلمين أو مساعدين مضافين غير الرائد.</p>}
      {manager ? <details style={{ marginTop: 16 }}><summary>إضافة معلم أو مساعد</summary><div style={{ marginTop: 12 }}><AcademicForm organizationId={org} table="section_staff" options={options} /></div></details> : null}
    </section>
  </div>;
}
