import { redirect } from "next/navigation";
import { requestMemberships, requestSession } from "../../lib/supabase/server";
import { canManage } from "../../lib/operations";
import { riyadhToday } from "../../lib/tasks";
import { Icon, StackArt } from "../../components/icons";
import { briefingFor } from "./assistant/actions";
import { Suspense } from "react";
import Link from "next/link";
import { briefingItems, withOrg } from "../../lib/bot-persona";
export const dynamic = "force-dynamic";
export const metadata = { title: "لوحة التشغيل" };

const roleNames: Record<string, string> = { owner: "مالك", admin: "مدير", staff: "موظف" };
function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Riyadh" }).format(new Date()));
  return hour < 12 ? "صباح الخير" : "مساء الخير";
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { client: supabase, user } = await requestSession();
  if (!user) redirect("/login");
  const loadMemberships = () => supabase.from("memberships")
    .select("organization_id,role,organizations(name,type)").eq("user_id", user.id);
  const shared = await requestMemberships();
  let memberships: { organization_id: string; role: string; organizations: unknown }[] | null = shared.data;
  let membershipError: unknown = shared.error || null;
  if (!membershipError && memberships?.length === 0) {
    // Only someone without an organization can have a pending email invitation to claim; checking it
    // on every visit cost a round trip for everyone else.
    await supabase.rpc("claim_member_invitations");
    ({ data: memberships, error: membershipError } = await loadMemberships());
  }
  if (!membershipError && memberships?.length === 0) {
    // This RPC accepts no client-provided email, tenant or role. PostgreSQL checks
    // the verified Auth email against an operator-approved invitation atomically.
    const { error: claimError } = await supabase.rpc("claim_organization_invitation");
    if (!claimError) ({ data: memberships, error: membershipError } = await loadMemberships());
  }
  const today = riyadhToday();
  const organizations = await Promise.all((memberships ?? []).map(async membership => {
    const org = membership.organization_id;
    const manager = canManage(membership.role);
    const count = (table: string) => supabase.from(table).select("id", { count: "exact", head: true }).eq("organization_id", org);
    const [open, done, late, pending, children, unpaid] = await Promise.all([
      count("tasks").neq("status", "done"),
      count("tasks").eq("status", "done"),
      count("tasks").neq("status", "done").lt("due_date", today),
      manager ? count("applications").in("status", ["new", "reviewing"]) : Promise.resolve({ count: 0, error: null }),
      count("children"),
      manager ? count("invoices").eq("status", "issued") : Promise.resolve({ count: null, error: null }),
    ]);
    return {
      id: org, name: (membership.organizations as unknown as { name: string } | null)?.name ?? "منشأة",
      role: membership.role, manager,
      // Task counts stay optional so a missing task table never hides the rest.
      failed: Boolean(pending.error || children.error || unpaid.error),
      tasks: open.error ? null : { open: open.count ?? 0, done: done.error ? 0 : done.count ?? 0, late: late.error ? 0 : late.count ?? 0 },
      pending: pending.count ?? 0, children: children.count ?? 0, unpaid: unpaid.count,
    };
  }));
  // Calendar month (Riyadh). ?m=YYYY-MM moves between months; anything else falls back to this month.
  const requested = (await searchParams).m;
  const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : today.slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const monthEnd = `${month}-${String(daysInMonth).padStart(2, "0")}`;
  const shift = (delta: number) => { const d = new Date(Date.UTC(year, monthNumber - 1 + delta, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const orgIds = organizations.map(org => org.id);
  const names = new Map(organizations.map(org => [org.id, org.name]));
  type Due = { id: string; title: string; status: string; priority: string; due_date: string | null; organization_id: string };
  const [upcomingResult, monthResult] = orgIds.length ? await Promise.all([
    supabase.from("tasks").select("id,title,status,priority,due_date,organization_id").in("organization_id", orgIds).neq("status", "done").not("due_date", "is", null).order("due_date").limit(6),
    supabase.from("tasks").select("due_date").in("organization_id", orgIds).neq("status", "done").gte("due_date", monthStart).lte("due_date", monthEnd).limit(500),
  ]) : [{ data: [] as Due[], error: null }, { data: [] as { due_date: string }[], error: null }];
  const upcoming = (upcomingResult.error ? [] : upcomingResult.data ?? []) as Due[];
  const dueDays = new Set(((monthResult.error ? [] : monthResult.data ?? []) as { due_date: string }[]).map(row => row.due_date));
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const date = new Date(Date.UTC(year, monthNumber - 1, index - firstWeekday + 1));
    return { iso: date.toISOString().slice(0, 10), day: date.getUTCDate(), inMonth: date.getUTCMonth() === monthNumber - 1 };
  });
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const dateLabel = (iso: string) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { day: "numeric", month: "long", weekday: "long", timeZone: "UTC" }).format(new Date(iso));
  const stageNames: Record<string, string> = { todo: "جديدة", doing: "قيد التنفيذ", review: "مراجعة" };

  const n = (value: number) => value.toLocaleString("ar-SA");
  const sum = (pick: (org: (typeof organizations)[number]) => number) => organizations.reduce((total, org) => total + pick(org), 0);
  const open = sum(org => org.tasks?.open ?? 0), done = sum(org => org.tasks?.done ?? 0), late = sum(org => org.tasks?.late ?? 0);
  const pending = sum(org => org.pending);
  const pct = (part: number, whole: number) => whole ? Math.round((part / whole) * 100) : 0;
  const first = organizations[0]?.id;
  // What needs attention today in the first organization: the same prioritised briefing the bot gives.
  const firstMember = (memberships ?? [])[0];
  const email = user.email ?? "";
  const displayName = email.split("@")[0] || "أهلًا";
  const mainRole = roleNames[organizations[0]?.role ?? ""] ?? "عضو";
  return <div className="dash">
    <div className="dash-main">
      <div className="topbar">
        <form className="search" action="/dashboard/tasks" role="search">
          <span className="tile-icon" aria-hidden="true"><Icon name="search" /></span>
          <label className="sr-only" htmlFor="task-search">ابحث في المهام</label>
          <input id="task-search" name="q" type="search" maxLength={80} placeholder="ابحث في المهام" />
        </form>
        <span className="today">{new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(new Date())}</span>
      </div>

      <section className="welcome" aria-labelledby="welcome-title">
        <div>
          <h1 id="welcome-title">{greeting()}، {displayName}</h1>
          <p>{open ? <>عندكم {n(open)} {open === 1 ? "مهمة مفتوحة" : "مهام مفتوحة"}{late ? <>، منها <Link href={first ? `/dashboard/tasks?org=${encodeURIComponent(first)}` : "/dashboard/tasks"}>{n(late)} متأخرة</Link></> : null}. وش ودّك تنجز اليوم؟</> : <>ما عندكم مهام مفتوحة. ابدأ يومك بمهمة جديدة.</>}</p>
          <Link className="primary-button" href={first ? `/dashboard/tasks?org=${encodeURIComponent(first)}` : "/dashboard/tasks"}>افتح المهام</Link>
        </div>
        <StackArt className="art" />
      </section>
      {membershipError ? <p role="alert">تعذر تحميل عضويات المنشآت. حاول مرة أخرى.</p> : null}

      <div className="stats">
        <Link className="stat sky" href={first ? `/dashboard/tasks?org=${encodeURIComponent(first)}` : "/dashboard/tasks"}>
          <span className="tile-icon tone-sky"><Icon name="board" /></span>
          <span className="figure">{n(done)}<small>/{n(done + open)}</small></span>
          <span className="label">مهام منجزة</span>
          <span className="progress"><span style={{ width: `${pct(done, done + open)}%` }} /></span>
        </Link>
        <Link className="stat peach" href={first ? `/dashboard/admissions?org=${encodeURIComponent(first)}` : "/dashboard/admissions"}>
          <span className="tile-icon tone-coral"><Icon name="flag" /></span>
          <span className="figure">{n(pending)}</span>
          <span className="label">طلبات التحاق تنتظر المراجعة</span>
          <span className="progress coral"><span style={{ width: `${Math.min(100, pending * 10)}%` }} /></span>
        </Link>
      </div>

      {first && firstMember ? <Suspense fallback={null}><Attention client={supabase} org={first} userId={user.id} manager={canManage(firstMember.role)} /></Suspense> : null}

      <section aria-labelledby="orgs">
        <div className="section-head"><h2 id="orgs">منشآتك</h2><Link className="view-all" href="/dashboard/operations">عرض الكل<Icon name="arrowNext" /></Link></div>
        {organizations.length ? <div className="org-cards">{organizations.map((org, index) => <a key={org.id} className={`org-tile g${(index % 3) + 1}`} href={`/dashboard/tasks?${new URLSearchParams({ org: org.id })}`}>
          <h3>{org.name}</h3>
          <span className="badge">{roleNames[org.role] ?? "عضو"}</span>
          {org.failed ? <span className="facts">تعذر تحميل بعض الأرقام</span> : <span className="facts">
            <span><Icon name="child" />{n(org.children)} طفل</span>
            <span><Icon name="board" />{org.tasks ? org.tasks.late ? `${n(org.tasks.late)} مهام متأخرة` : `${n(org.tasks.open)} مهام مفتوحة` : "المهام غير مفعلة"}</span>
            {org.unpaid ? <span><Icon name="wallet" />{n(org.unpaid)} فواتير غير مسددة</span> : null}
          </span>}
        </a>)}</div> : <p className="info-banner">حسابك غير مرتبط بمنشأة بعد. اطلب من مسؤول المنصة إسناد حسابك، ثم أعد تحميل الصفحة.</p>}
      </section>

      <section aria-labelledby="upcoming">
        <div className="section-head"><h2 id="upcoming">المهام القادمة</h2><Link className="view-all" href="/dashboard/tasks">عرض الكل<Icon name="arrowNext" /></Link></div>
        {upcoming.length ? <div className="table-wrap"><table className="data-table">
          <thead><tr><th>المهمة</th><th>المنشأة</th><th>المرحلة</th><th>التسليم</th><th>الحالة</th></tr></thead>
          <tbody>{upcoming.map(task => {
            const late = task.due_date! < today, isToday = task.due_date === today;
            return <tr key={task.id}>
              <td className="strong">{task.title}</td>
              <td className="hide-sm">{names.get(task.organization_id) ?? "منشأة"}</td>
              <td className="hide-sm">{stageNames[task.status] ?? task.status}</td>
              <td>{new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(task.due_date!))}</td>
              <td><span className={`dot-status${late ? " late" : isToday ? " today" : ""}`}>{late ? "متأخرة" : isToday ? "اليوم" : "في وقتها"}</span></td>
            </tr>;
          })}</tbody>
        </table></div> : <p className="info-banner">ما فيه مهام لها موعد تسليم قريب.</p>}
      </section>

      <section className="mobile-only" aria-labelledby="shortcuts"><h2 id="shortcuts" className="section-label">اختصارات</h2>
        <div className="tiles">
          <Link className="tile" href="/dashboard/tasks"><span className="tile-icon tone-plum"><Icon name="plus" /></span><span className="title">مهمة جديدة</span><span className="sub">أضفها ووزّعها</span></Link>
          <Link className="tile" href="/dashboard/children"><span className="tile-icon tone-rose"><Icon name="child" /></span><span className="title">الأطفال</span><span className="sub">الملفات والبيانات</span></Link>
          <Link className="tile" href="/dashboard/attendance"><span className="tile-icon tone-sun"><Icon name="clock" /></span><span className="title">الحضور</span><span className="sub">سجّل حضور اليوم</span></Link>
          <Link className="tile" href="/dashboard/assistant"><span className="tile-icon tone-sky"><Icon name="spark" /></span><span className="title">المساعد</span><span className="sub">اسأل بالعربي</span></Link>
        </div>
      </section>
    </div>

    <aside className="side-panel" aria-label="ملفك والتقويم">
      <div className="profile">
        <span className="avatar" aria-hidden="true">{(email[0] ?? "س").toUpperCase()}</span>
        <strong dir="auto">{displayName}</strong>
        <span>{mainRole}</span>
        <Link className="btn-primary" href="/dashboard/settings">الملف</Link>
      </div>
      <section className="calendar" aria-labelledby="cal-title">
        <header>
          <Link className="nav" href={`/dashboard?m=${shift(-1)}`} aria-label="الشهر السابق"><Icon name="arrowPrev" /></Link>
          <span id="cal-title">{new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthStart}T00:00:00Z`))}</span>
          <Link className="nav" href={`/dashboard?m=${shift(1)}`} aria-label="الشهر التالي"><Icon name="arrowNext" /></Link>
        </header>
        <table>
          <thead><tr>{["ح", "ن", "ث", "ر", "خ", "ج", "س"].map((day, index) => <th key={index} scope="col">{day}</th>)}</tr></thead>
          <tbody>{weeks.map((week, index) => <tr key={index}>{week.map(cell => {
            const due = cell.inMonth && dueDays.has(cell.iso);
            const state = cell.iso === today ? "now" : due ? (cell.iso < today ? "late" : "due") : "";
            return <td key={cell.iso} className={[cell.inMonth ? "" : "out", state].filter(Boolean).join(" ")} aria-label={`${dateLabel(cell.iso)}${due ? "، فيه مهام" : ""}`}><span>{n(cell.day)}</span></td>;
          })}</tr>)}</tbody>
        </table>
      </section>
      <section aria-labelledby="reminders">
        <h2 id="reminders" className="section-label">التذكيرات</h2>
        {upcoming.length ? <ul className="reminders">{upcoming.slice(0, 4).map(task => <li key={task.id}>
          <span className={`bell${task.due_date! < today ? " late" : ""}`}><Icon name="bell" /></span>
          <span><strong>{task.title}</strong><small>{dateLabel(task.due_date!)}</small></span>
        </li>)}</ul> : <p className="hint">ما فيه تذكيرات قادمة.</p>}
      </section>
    </aside>
  </div>;
}

/** "Needs your attention" streams in after the page, so its queries never hold up the first paint. */
async function Attention({ client, org, userId, manager }: { client: Awaited<ReturnType<typeof requestSession>>["client"]; org: string; userId: string; manager: boolean }) {
  const briefing = await briefingFor(client, org, userId, manager);
  const attention = briefing.data ? briefingItems(briefing.data).filter(item => item.tone !== "ok").slice(0, 6) : [];
  if (!attention.length) return null;
  return <section aria-labelledby="attention" className="card attention">
    <div className="section-head"><h2 id="attention">تحتاج انتباهك اليوم</h2><Link className="view-all" href="/dashboard/assistant">اسأل المساعد<Icon name="arrowNext" /></Link></div>
    <ul className="bot-list">{attention.map((item, index) => <li key={index} className={`brief-${item.tone}`}><Link href={withOrg(item.href, org)}>{item.text}</Link><span>{item.label}</span></li>)}</ul>
  </section>;
}
