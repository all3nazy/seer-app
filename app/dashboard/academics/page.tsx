import Link from "next/link";
import { loadOrgContext } from "../../../lib/org-context";
import { OrgSwitcher, OrgUnavailable } from "../../../components/org-unavailable";
import { AcademicForm, AcademicRow } from "../../../components/academic-forms";
import { sectionGenderLabels, stageLabels, type AcademicTerm, type AcademicYear, type GradeLevel, type Holiday, type Section } from "../../../lib/academics";
import { memberName, type Member } from "../../../lib/team";

export const dynamic = "force-dynamic";
export const metadata = { title: "الهيكل الدراسي" };
const tabs = { structure: "الصفوف والشُعب", calendar: "السنة والفصول والإجازات" } as const;
type Tab = keyof typeof tabs;
const date = (value: string) => new Date(value).toLocaleDateString("ar-SA", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

export default async function AcademicsPage({ searchParams }: { searchParams: Promise<{ org?: string; tab?: string }> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager, organizations, userId } = context;
  const tab: Tab = params.tab === "calendar" ? "calendar" : "structure";
  const [years, terms, holidays, grades, sections, branches, members, counts] = await Promise.all([
    client.from("academic_years").select("id,name,starts_on,ends_on,is_current").eq("organization_id", org).order("starts_on", { ascending: false }),
    client.from("academic_terms").select("id,academic_year_id,name,starts_on,ends_on").eq("organization_id", org).order("starts_on"),
    client.from("holidays").select("id,name,starts_on,ends_on").eq("organization_id", org).order("starts_on", { ascending: false }).limit(100),
    client.from("grade_levels").select("id,name,stage,sort_order").eq("organization_id", org).order("sort_order").order("name"),
    client.from("sections").select("id,grade_level_id,branch_id,name,gender,capacity,homeroom_teacher_id").eq("organization_id", org).order("name"),
    client.from("branches").select("id,name").eq("organization_id", org).order("name").limit(200),
    client.from("memberships").select("user_id,role,display_name").eq("organization_id", org),
    client.from("children").select("section_id").eq("organization_id", org).not("section_id", "is", null).limit(10000),
  ]);
  const failed = [years, terms, holidays, grades, sections].find(result => result.error);
  const yearRows = (years.data ?? []) as AcademicYear[];
  const gradeRows = (grades.data ?? []) as GradeLevel[];
  const sectionRows = (sections.data ?? []) as Section[];
  const memberRows = (members.data ?? []) as Member[];
  const memberOptions = memberRows.map(member => ({ id: member.user_id, name: memberName(member, member.user_id === userId) }));
  const branchOptions = (branches.data ?? []) as { id: string; name: string }[];
  const options = { years: yearRows.map(year => ({ id: year.id, name: year.name })), grades: gradeRows.map(grade => ({ id: grade.id, name: grade.name })), branches: branchOptions, members: memberOptions };
  const enrolled = new Map<string, number>();
  for (const row of (counts.data ?? []) as { section_id: string }[]) enrolled.set(row.section_id, (enrolled.get(row.section_id) ?? 0) + 1);
  const orgParam = encodeURIComponent(org);
  return <>
    <header className="page-head">
      <div><h1>الهيكل الدراسي</h1><p>صفوف {orgName} وشُعبها، والسنة الدراسية وفصولها وإجازاتها.</p></div>
      <OrgSwitcher path="/dashboard/academics" current={org} organizations={organizations} extra={{ tab }} />
    </header>
    <nav className="segments" aria-label="أقسام الهيكل الدراسي">
      {(Object.keys(tabs) as Tab[]).map(key => <Link key={key} href={`/dashboard/academics?org=${orgParam}&tab=${key}`} aria-current={key === tab ? "page" : undefined}>{tabs[key]}</Link>)}
    </nav>
    {failed ? <p role="alert" className="info-banner">تعذر تحميل الهيكل الدراسي. أعد تحميل الصفحة.</p> : tab === "structure" ? <div style={{ display: "grid", gap: 24 }}>
      {gradeRows.length ? gradeRows.map(grade => {
        const gradeSections = sectionRows.filter(section => section.grade_level_id === grade.id);
        return <section key={grade.id} className="card" aria-labelledby={`grade-${grade.id}`}>
          <ul className="records" style={{ marginBottom: 12 }}>
            {manager ? <AcademicRow organizationId={org} table="grade_levels" record={grade}>
              <h2 id={`grade-${grade.id}`} style={{ margin: 0 }}>{grade.name} <span className="chip-soft">{stageLabels[grade.stage]}</span></h2>
            </AcademicRow> : <li><h2 id={`grade-${grade.id}`} style={{ margin: 0 }}>{grade.name} <span className="chip-soft">{stageLabels[grade.stage]}</span></h2></li>}
          </ul>
          {gradeSections.length ? <div className="list">{gradeSections.map(section => {
            const count = enrolled.get(section.id) ?? 0;
            const teacher = memberRows.find(member => member.user_id === section.homeroom_teacher_id);
            return <Link key={section.id} className="list-row" href={`/dashboard/academics/sections/${section.id}?org=${orgParam}`}>
              <span className="body"><span className="title">شعبة {section.name}</span>
                <span className="sub">{[sectionGenderLabels[section.gender], teacher ? `الرائد: ${memberName(teacher)}` : null, branchOptions.find(item => item.id === section.branch_id)?.name].filter(Boolean).join(" · ")}</span></span>
              <span className={`chip-soft${section.capacity && count > section.capacity ? " rose" : ""}`}>{count.toLocaleString("ar-SA")}{section.capacity ? ` / ${section.capacity.toLocaleString("ar-SA")}` : ""} طالب</span>
            </Link>;
          })}</div> : <p className="hint">ما فيه شُعب في هذا الصف.</p>}
        </section>;
      }) : <p className="empty">ابدأ بإضافة الصفوف، مثل «الروضة الأولى» أو «الصف الأول»، ثم أضف الشُعب داخلها.</p>}
      {manager ? <section className="card" style={{ display: "grid", gap: 16 }}>
        <details><summary>إضافة صف</summary><div style={{ marginTop: 12 }}><AcademicForm organizationId={org} table="grade_levels" /></div></details>
        {gradeRows.length ? <details><summary>إضافة شعبة</summary><div style={{ marginTop: 12 }}><AcademicForm organizationId={org} table="sections" options={options} /></div></details> : null}
      </section> : null}
    </div> : <div style={{ display: "grid", gap: 24 }}>
      <section className="card" aria-labelledby="years-title">
        <h2 id="years-title">السنوات الدراسية</h2>
        {yearRows.length ? <ul className="records">{yearRows.map(year => {
          const content = <><strong>{year.name}</strong> {year.is_current ? <span className="chip-soft ok">الحالية</span> : null}
            <span className="hint" style={{ display: "block" }}>{date(year.starts_on)} — {date(year.ends_on)}</span>
            {((terms.data ?? []) as AcademicTerm[]).filter(term => term.academic_year_id === year.id).map(term => <span key={term.id} className="hint" style={{ display: "block" }}>• {term.name}: {date(term.starts_on)} — {date(term.ends_on)}</span>)}</>;
          return manager ? <AcademicRow key={year.id} organizationId={org} table="academic_years" record={year}>{content}</AcademicRow> : <li key={year.id}><div>{content}</div></li>;
        })}</ul> : <p className="hint">ما فيه سنة دراسية بعد.</p>}
        {manager ? <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <details><summary>إضافة سنة دراسية</summary><div style={{ marginTop: 12 }}><AcademicForm organizationId={org} table="academic_years" /></div></details>
          {yearRows.length ? <details><summary>إضافة فصل دراسي</summary><div style={{ marginTop: 12 }}><AcademicForm organizationId={org} table="academic_terms" options={options} /></div></details> : null}
          {((terms.data ?? []) as AcademicTerm[]).length ? <details><summary>تعديل الفصول الدراسية</summary><ul className="records" style={{ marginTop: 12 }}>
            {((terms.data ?? []) as AcademicTerm[]).map(term => <AcademicRow key={term.id} organizationId={org} table="academic_terms" record={term}>{yearRows.find(year => year.id === term.academic_year_id)?.name} — {term.name}</AcademicRow>)}
          </ul></details> : null}
        </div> : null}
      </section>
      <section className="card" aria-labelledby="holidays-title">
        <h2 id="holidays-title">الإجازات</h2>
        {(holidays.data ?? []).length ? <ul className="records">{((holidays.data ?? []) as Holiday[]).map(holiday => {
          const content = <><strong>{holiday.name}</strong><span className="hint" style={{ display: "block" }}>{holiday.starts_on === holiday.ends_on ? date(holiday.starts_on) : `${date(holiday.starts_on)} — ${date(holiday.ends_on)}`}</span></>;
          return manager ? <AcademicRow key={holiday.id} organizationId={org} table="holidays" record={holiday}>{content}</AcademicRow> : <li key={holiday.id}><div>{content}</div></li>;
        })}</ul> : <p className="hint">ما فيه إجازات مسجّلة.</p>}
        {manager ? <details style={{ marginTop: 16 }}><summary>إضافة إجازة</summary><div style={{ marginTop: 12 }}><AcademicForm organizationId={org} table="holidays" /></div></details> : null}
      </section>
    </div>}
  </>;
}
