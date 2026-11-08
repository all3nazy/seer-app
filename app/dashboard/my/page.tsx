import { weekdays } from "../../../lib/learning";
import Link from "next/link";
import { headers } from "next/headers";
import { loadOrgContext } from "../../../lib/org-context";
import { OrgSwitcher, OrgUnavailable } from "../../../components/org-unavailable";
import { CopyLink, InquiryForm } from "../../../components/work-forms";
import { dueLabel, isOverdue, riyadhToday, taskPriorityLabels, taskStatusLabels, type Task } from "../../../lib/tasks";
import { inquiryCategoryLabels, inquiryStatusLabels, inquiryStatusTone, since, type Inquiry } from "../../../lib/inquiries";
import { memberName, type Member } from "../../../lib/team";
import { CheckInButton, LeaveDecision, LeaveForm } from "../../../components/hr-forms";
import { leaveLabels, leaveStatusLabels, leaveStatusTone, type LeaveKind } from "../../../lib/hr";

export const dynamic = "force-dynamic";
export const metadata = { title: "مهامي" };

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, organizations, userId, manager } = context;
  const today = riyadhToday();
  const [tasks, inquiries, me] = await Promise.all([
    client.from("tasks").select("id,title,notes,status,priority,due_date,completed_at,assignee_id").eq("organization_id", org).eq("assignee_id", userId).order("due_date", { ascending: true, nullsFirst: false }).limit(300),
    client.from("inquiries").select("id,author_id,category,subject,body,task_id,status,created_at,updated_at").eq("organization_id", org).eq("author_id", userId).order("updated_at", { ascending: false }).limit(50),
    client.from("memberships").select("user_id,role,display_name").eq("organization_id", org).eq("user_id", userId).maybeSingle(),
  ]);
  // The teacher's own week: timetable periods and the classes they lead.
  const [mySlots, myClasses] = await Promise.all([
    client.from("timetable_slots").select("weekday,period,room,subjects(name),sections(id,name,grade_levels(name))").eq("organization_id", org).eq("teacher_id", userId).order("weekday").order("period").limit(80),
    client.from("sections").select("id,name,grade_levels(name)").eq("organization_id", org).eq("homeroom_teacher_id", userId),
  ]);
  type SlotRow = { weekday: number; period: number; room: string | null; subjects: { name: string } | null; sections: { id: string; name: string; grade_levels: { name: string } | null } | null };
  const slots = (mySlots.data ?? []) as unknown as SlotRow[];
  const leads = (myClasses.data ?? []) as unknown as { id: string; name: string; grade_levels: { name: string } | null }[];
  const todayWeekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const className = (section: { name: string; grade_levels: { name: string } | null } | null) => section ? [section.grade_levels?.name, section.name].filter(Boolean).join(" — ") : "";
  // The employee's own HR file, if the manager linked one to this account.
  const { data: myFile } = await client.from("staff_profiles").select("id,annual_leave_days").eq("organization_id", org).eq("user_id", userId).maybeSingle();
  const [myToday, myLeave] = myFile ? await Promise.all([
    client.from("staff_attendance").select("check_in,check_out,status").eq("staff_id", myFile.id as string).eq("work_date", today).maybeSingle(),
    client.from("leave_requests").select("id,kind,starts_on,ends_on,days,status").eq("staff_id", myFile.id as string).order("starts_on", { ascending: false }).limit(10),
  ]) : [{ data: null }, { data: [] }];
  const rows = (tasks.data ?? []) as Task[];
  const open = rows.filter(task => task.status !== "done");
  const overdue = open.filter(task => isOverdue(task, today));
  const dueToday = open.filter(task => task.due_date === today);
  const upcoming = open.filter(task => !isOverdue(task, today) && task.due_date !== today);
  const done = rows.filter(task => task.status === "done").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "")).slice(0, 10);
  const head = await headers();
  const link = `${head.get("x-forwarded-proto") ?? "https"}://${head.get("host") ?? "seer-app-psi.vercel.app"}/m`;
  const orgParam = encodeURIComponent(org);
  const taskRow = (task: Task) => <Link key={task.id} className="list-row" href={`/dashboard/tasks/${task.id}?org=${orgParam}`}>
    <span className="body"><span className="title">{task.title}</span>
      <span className="sub">{[taskStatusLabels[task.status], task.priority === "high" ? taskPriorityLabels.high : null, dueLabel(task.due_date, today) ? `التسليم ${dueLabel(task.due_date, today)}` : null].filter(Boolean).join(" · ")}</span></span>
    {isOverdue(task, today) ? <span className="chip-soft rose">متأخرة</span> : task.status === "done" ? <span className="chip-soft ok">منجزة</span> : <span className="chip-soft">{taskStatusLabels[task.status]}</span>}
  </Link>;
  const group = (title: string, items: Task[], empty?: string) => items.length || empty ? <section style={{ marginBottom: 20 }}><h3 className="section-label" style={{ marginBottom: 8 }}>{title} ({items.length.toLocaleString("ar-SA")})</h3>
    {items.length ? <div className="list">{items.map(taskRow)}</div> : <p className="hint">{empty}</p>}</section> : null;
  return <>
    <header className="page-head">
      <div><h1>مهامي</h1><p>أهلًا {memberName(me.data as Member | undefined)}. المهام المسندة لك في {orgName}، واستفساراتك للإدارة.</p></div>
      <OrgSwitcher path="/dashboard/my" current={org} organizations={organizations} />
    </header>
    <p className="info-banner" style={{ marginBottom: 24, alignItems: "center", flexWrap: "wrap" }}>
      <span>رابط صفحتك: <span dir="ltr" style={{ wordBreak: "break-all" }}>{link}</span>. يفتح بعد تسجيل الدخول بحسابك، وكل موظف يشوف مهامه هو.</span>
      <CopyLink link={link} />
    </p>
    {myFile ? <section className="card my-hr" aria-labelledby="hr-title" style={{ marginBottom: 20 }}>
      <h2 id="hr-title">حضوري وإجازاتي</h2>
      <div className="my-hr-grid">
        {(myToday.data as { status: string } | null)?.status === "leave" ? <p className="chip-soft ok">اليوم إجازة 🌴</p>
          : <CheckInButton organizationId={org} staffId={myFile.id as string} checkedIn={(myToday.data as { check_in: string | null } | null)?.check_in ?? null} checkedOut={(myToday.data as { check_out: string | null } | null)?.check_out ?? null} />}
        <details><summary>طلب إجازة</summary><div style={{ marginTop: 10 }}><LeaveForm organizationId={org} manager={false} staffOptions={[{ id: myFile.id as string, name: "" }]} /></div></details>
      </div>
      {((myLeave.data ?? []) as { id: string; kind: LeaveKind; starts_on: string; ends_on: string; days: number; status: string }[]).length ? <ul className="records" style={{ marginTop: 12 }}>
        {((myLeave.data ?? []) as { id: string; kind: LeaveKind; starts_on: string; ends_on: string; days: number; status: string }[]).map(row => <li key={row.id}>
          <span>{leaveLabels[row.kind]} · {row.starts_on}{row.ends_on !== row.starts_on ? ` ← ${row.ends_on}` : ""} ({row.days.toLocaleString("ar-SA")} يوم)</span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}><span className={`chip-soft ${leaveStatusTone[row.status]}`}>{leaveStatusLabels[row.status]}</span>{row.status === "pending" ? <LeaveDecision organizationId={org} id={row.id} manager={false} mine /> : null}</span>
        </li>)}</ul> : null}
    </section> : <p className="info-banner" style={{ marginBottom: 20 }}>تسجيل حضورك وطلب الإجازة يظهر هنا بعد ما يربط المدير ملفك الوظيفي بحسابك من «الموظفين».</p>}
    {slots.length || leads.length ? <section className="card" aria-labelledby="week-title" style={{ marginBottom: 20 }}>
      <h2 id="week-title">جدولي وفصلي</h2>
      {leads.length ? <div className="chip-row" style={{ marginBlock: 10 }}>{leads.map(section => <span key={section.id} style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <strong>رائد فصل {className(section)}:</strong>
        <a className="btn btn-sm" href={`/dashboard/classes/${section.id}?org=${encodeURIComponent(org)}`}>الفصل مباشر</a>
        <a className="btn btn-sm" href={`/dashboard/attendance?org=${encodeURIComponent(org)}&section=${section.id}`}>الحضور</a>
        <a className="btn btn-sm" href={`/dashboard/learning?org=${encodeURIComponent(org)}&section=${section.id}`}>الدرجات</a>
      </span>)}</div> : null}
      {slots.length ? <div className="my-week">{weekdays.map(([day, label]) => { const items = slots.filter(slot => slot.weekday === day); return items.length ? <div key={day} className={`my-day${day === todayWeekday ? " is-today" : ""}`}>
        <strong>{label}{day === todayWeekday ? " · اليوم" : ""}</strong>
        <ul>{items.map(slot => <li key={`${slot.weekday}-${slot.period}`}><span className="chip-soft">الحصة {slot.period.toLocaleString("ar-SA")}</span> {slot.subjects?.name ?? "مادة"} <span className="hint">{className(slot.sections)}{slot.room ? ` · ${slot.room}` : ""}</span></li>)}</ul>
      </div> : null; })}</div> : null}
    </section> : null}
    <div className="home-grid">
      <section className="card" aria-labelledby="tasks-title">
        <h2 id="tasks-title">المهام المسندة لي</h2>
        {tasks.error ? <p role="alert">تعذر تحميل المهام.</p> : rows.length ? <>
          {group("متأخرة", overdue)}
          {group("اليوم", dueToday)}
          {group("القادمة", upcoming, open.length ? undefined : "ما عندك مهام مفتوحة. 👏")}
          {group("أنجزتها مؤخرًا", done)}
        </> : <p className="hint">ما فيه مهام مسندة لك حاليًا.</p>}
        {manager ? <p style={{ marginTop: 12 }}><Link href={`/dashboard/tasks?org=${orgParam}`}>لوحة مهام المنشأة كاملة</Link></p> : null}
      </section>
      <section className="card" aria-labelledby="inquiries-title">
        <h2 id="inquiries-title">استفساراتي للإدارة</h2>
        {inquiries.error ? <p role="alert">تعذر تحميل الاستفسارات.</p> : (inquiries.data ?? []).length ? <div className="list" style={{ marginBottom: 16 }}>
          {((inquiries.data ?? []) as Inquiry[]).map(item => <Link key={item.id} className="list-row" href={`/dashboard/inquiries/${item.id}?org=${orgParam}`}>
            <span className="body"><span className="title">{item.subject}</span><span className="sub">{inquiryCategoryLabels[item.category]} · {since(item.updated_at)}</span></span>
            <span className={`chip-soft ${inquiryStatusTone[item.status]}`}>{inquiryStatusLabels[item.status]}</span>
          </Link>)}
        </div> : <p className="hint" style={{ marginBottom: 16 }}>ما رفعت استفسارات بعد.</p>}
        <details><summary>استفسار جديد</summary><div style={{ marginTop: 12 }}><InquiryForm organizationId={org} tasks={open.map(task => ({ id: task.id, name: task.title }))} /></div></details>
      </section>
    </div>
  </>;
}
