import Link from "next/link";
import { loadOrgContext } from "../../../lib/org-context";
import { OrgSwitcher, OrgUnavailable } from "../../../components/org-unavailable";
import { LeaveDecision, LeaveForm, StaffAttendanceSelect, StaffForm } from "../../../components/hr-forms";
import { contractDaysLeft, contractLabels, leaveLabels, leaveStatusLabels, leaveStatusTone, monthlyPay, staffAttendanceLabels, staffColumns, type LeaveKind, type StaffProfile } from "../../../lib/hr";
import { memberName, type Member } from "../../../lib/team";
import { sar } from "../../../lib/finance";
import { isIsoDate, riyadhToday } from "../../../lib/students";

export const dynamic = "force-dynamic";
export const metadata = { title: "الموظفين" };
const tabs = { people: "الموظفين", leave: "الإجازات", attendance: "حضور الموظفين" } as const;
type Tab = keyof typeof tabs;
const shortDate = (value: string) => new Date(value).toLocaleDateString("ar-SA", { timeZone: "UTC", day: "numeric", month: "short" });

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ org?: string; tab?: string; day?: string; edit?: string }> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager, organizations, userId } = context;
  if (!manager) return <section className="card"><h1>الموظفين</h1><p>ملفات الموظفين لمالك المنشأة أو مديرها. حضورك وإجازاتك في <Link href={`/dashboard/my?org=${encodeURIComponent(org)}`}>مهامي</Link>.</p></section>;
  const tab: Tab = params.tab && params.tab in tabs ? params.tab as Tab : "people";
  const orgParam = encodeURIComponent(org);
  const today = riyadhToday();
  const [staffResult, membersResult, pendingResult] = await Promise.all([
    client.from("staff_profiles").select(staffColumns).eq("organization_id", org).order("status").order("full_name").limit(500),
    client.from("memberships").select("user_id,role,display_name").eq("organization_id", org),
    client.from("leave_requests").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "pending"),
  ]);
  const staff = (staffResult.data ?? []) as StaffProfile[];
  const active = staff.filter(item => item.status === "active");
  const members = ((membersResult.data ?? []) as Member[]).map(member => ({ id: member.user_id, name: memberName(member, member.user_id === userId) }));
  const header = <>
    <header className="page-head">
      <div><h1>الموظفين</h1><p>ملفات موظفي {orgName} وعقودهم وإجازاتهم وحضورهم.</p></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Link className="btn" href={`/dashboard/staff/payroll?org=${orgParam}`}>الرواتب</Link>
        <OrgSwitcher path="/dashboard/staff" current={org} organizations={organizations} extra={{ tab }} />
      </div>
    </header>
    <nav className="segments" aria-label="أقسام الموظفين" style={{ marginBottom: 16 }}>{(Object.keys(tabs) as Tab[]).map(key => <Link key={key} href={`/dashboard/staff?org=${orgParam}&tab=${key}`} aria-current={key === tab ? "page" : undefined}>{tabs[key]}{key === "leave" && pendingResult.count ? ` (${pendingResult.count.toLocaleString("ar-SA")})` : ""}</Link>)}</nav>
  </>;

  if (tab === "people") {
    const editing = staff.find(item => item.id === params.edit);
    const payroll = active.reduce((sum, item) => sum + monthlyPay(item), 0);
    const ending = active.filter(item => { const left = contractDaysLeft(item.contract_end, today); return left !== null && left <= 60; });
    return <>{header}
      <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", marginBottom: 20 }}>
        <div className="stat lilac"><span className="label">على رأس العمل</span><span className="figure">{active.length.toLocaleString("ar-SA")}</span></div>
        <div className="stat mint"><span className="label">الرواتب الشهرية</span><span className="figure" style={{ fontSize: 22 }}>{sar(payroll)}</span></div>
        <div className="stat peach"><span className="label">عقود تنتهي خلال ٦٠ يوم</span><span className="figure">{ending.length.toLocaleString("ar-SA")}</span></div>
        <div className="stat sky"><span className="label">طلبات إجازة معلّقة</span><span className="figure">{(pendingResult.count ?? 0).toLocaleString("ar-SA")}</span></div>
      </div>
      <section className="card" style={{ marginBottom: 20 }}><details open={Boolean(editing) || !staff.length}><summary><strong>{editing ? `تعديل ملف ${editing.full_name}` : "إضافة موظف"}</strong></summary>
        <div style={{ marginTop: 14 }}><StaffForm key={editing?.id ?? "new"} organizationId={org} staff={editing} members={members} /></div></details></section>
      {staff.length ? <section className="card"><div className="table-wrap"><table className="links-table" style={{ width: "100%" }}>
        <thead><tr><th>الموظف</th><th>العقد</th><th>الراتب الشهري</th><th>المباشرة</th><th></th></tr></thead>
        <tbody>{staff.map(item => { const left = contractDaysLeft(item.contract_end, today); return <tr key={item.id} style={item.status === "left" ? { opacity: .55 } : undefined}>
          <td><strong>{item.full_name}</strong><span className="hint" style={{ display: "block" }}>{[item.job_title, item.user_id ? "له حساب" : null, item.status === "left" ? "انتهت خدمته" : null].filter(Boolean).join(" · ")}</span></td>
          <td>{contractLabels[item.contract_type]}{left !== null ? <span className={`chip-soft ${left < 0 ? "rose" : left <= 60 ? "coral" : ""}`} style={{ marginInlineStart: 6 }}>{left < 0 ? "منتهي" : `باقي ${left.toLocaleString("ar-SA")} يوم`}</span> : null}</td>
          <td>{sar(monthlyPay(item))}</td><td>{item.hire_date ? shortDate(item.hire_date) : "—"}</td>
          <td><Link className="btn btn-sm" href={`/dashboard/staff?org=${orgParam}&tab=people&edit=${item.id}`}>تعديل</Link></td>
        </tr>; })}</tbody></table></div></section> : null}
    </>;
  }

  if (tab === "leave") {
    const { data } = await client.from("leave_requests").select("id,staff_id,kind,starts_on,ends_on,days,reason,status,created_at").eq("organization_id", org).order("status").order("starts_on", { ascending: false }).limit(200);
    const rows = (data ?? []) as { id: string; staff_id: string; kind: LeaveKind; starts_on: string; ends_on: string; days: number; reason: string | null; status: string }[];
    const name = new Map(staff.map(item => [item.id, item.full_name]));
    const year = today.slice(0, 4);
    const used = new Map<string, number>();
    for (const row of rows) if (row.status === "approved" && row.kind === "annual" && row.starts_on.startsWith(year)) used.set(row.staff_id, (used.get(row.staff_id) ?? 0) + row.days);
    return <>{header}
      <section className="card" style={{ marginBottom: 20 }}><details open={!rows.length}><summary><strong>تسجيل إجازة</strong></summary><div style={{ marginTop: 14 }}><LeaveForm organizationId={org} manager staffOptions={active.map(item => ({ id: item.id, name: item.full_name }))} /></div></details></section>
      <section className="card"><h2>طلبات الإجازة</h2>
        {rows.length ? <ul className="records">{rows.map(row => <li key={row.id}>
          <span><strong>{name.get(row.staff_id) ?? "موظف"}</strong> · {leaveLabels[row.kind]} · {shortDate(row.starts_on)}{row.ends_on !== row.starts_on ? ` ← ${shortDate(row.ends_on)}` : ""} ({row.days.toLocaleString("ar-SA")} يوم)
            {row.kind === "annual" ? <span className="hint"> · المستخدم هذي السنة {(used.get(row.staff_id) ?? 0).toLocaleString("ar-SA")} من {(staff.find(item => item.id === row.staff_id)?.annual_leave_days ?? 21).toLocaleString("ar-SA")}</span> : null}
            {row.reason ? <span className="hint" style={{ display: "block" }}>{row.reason}</span> : null}</span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}><span className={`chip-soft ${leaveStatusTone[row.status]}`}>{leaveStatusLabels[row.status]}</span>{row.status === "pending" ? <LeaveDecision organizationId={org} id={row.id} manager mine={false} /> : null}</span>
        </li>)}</ul> : <p className="empty">ما فيه طلبات إجازة.</p>}
      </section>
    </>;
  }

  const day = isIsoDate(params.day) && params.day <= today ? params.day : today;
  const { data } = await client.from("staff_attendance").select("staff_id,status,check_in,check_out,note").eq("organization_id", org).eq("work_date", day);
  const byStaff = new Map(((data ?? []) as { staff_id: string; status: string; check_in: string | null; check_out: string | null }[]).map(row => [row.staff_id, row]));
  const time = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit" }) : "—";
  const counts = Object.fromEntries((["present", "late", "absent", "leave"] as const).map(status => [status, [...byStaff.values()].filter(row => row.status === status).length]));
  return <>{header}
    <form className="toolbar" style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginBottom: 16 }}>
      <input type="hidden" name="org" value={org} /><input type="hidden" name="tab" value="attendance" />
      <label>اليوم<input type="date" name="day" max={today} defaultValue={day} /></label><button type="submit" className="btn">عرض</button>
      {(["present", "late", "absent", "leave"] as const).map(status => <span key={status} className="chip-soft">{staffAttendanceLabels[status]}: {counts[status].toLocaleString("ar-SA")}</span>)}
      <span className="chip-soft coral">ما تسجّل: {(active.length - byStaff.size).toLocaleString("ar-SA")}</span>
    </form>
    <section className="card"><div className="table-wrap"><table className="links-table" style={{ width: "100%" }}>
      <thead><tr><th>الموظف</th><th>الحالة</th><th>الحضور</th><th>الانصراف</th></tr></thead>
      <tbody>{active.map(item => { const row = byStaff.get(item.id); return <tr key={item.id}>
        <td><strong>{item.full_name}</strong><span className="hint" style={{ display: "block" }}>{item.job_title ?? ""}</span></td>
        <td><StaffAttendanceSelect organizationId={org} staffId={item.id} day={day} status={row?.status ?? null} /></td>
        <td>{time(row?.check_in ?? null)}</td><td>{time(row?.check_out ?? null)}</td>
      </tr>; })}</tbody></table></div>
      <p className="hint" style={{ marginTop: 10 }}>الموظف اللي له حساب يسجّل حضوره وانصرافه بنفسه من صفحة «مهامي».</p></section>
  </>;
}
