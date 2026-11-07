import Link from "next/link";
import { loadOrgContext } from "../../../lib/org-context";
import { OrgSwitcher, OrgUnavailable } from "../../../components/org-unavailable";
import { StudentProfileForm } from "../../../components/student-forms";
import { Icon } from "../../../components/icons";
import { age, attendanceLabels, attendanceTone, isAttendanceStatus, riyadhToday } from "../../../lib/students";

export const dynamic = "force-dynamic";
export const metadata = { title: "الطلاب" };
const pageSize = 30;

type Row = { id: string; full_name: string; date_of_birth: string | null; branch_id: string | null };

export default async function ChildrenPage({ searchParams }: { searchParams: Promise<{ org?: string; q?: string; branch?: string; page?: string }> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager, organizations } = context;
  const search = (params.q ?? "").trim().slice(0, 60);
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 10000 ? requestedPage : 1;
  const branchesResult = await client.from("branches").select("id,name").eq("organization_id", org).order("name").limit(200);
  const branches = (branchesResult.data ?? []) as { id: string; name: string }[];
  const branch = branches.some(item => item.id === params.branch) ? params.branch : undefined;
  let query = client.from("children").select("id,full_name,date_of_birth,branch_id", { count: "exact" }).eq("organization_id", org);
  // Escape LIKE wildcards so a search is always a plain substring match.
  if (search) query = query.ilike("full_name", `%${search.replace(/[\\%_]/g, character => `\\${character}`)}%`);
  if (branch) query = query.eq("branch_id", branch);
  const { data, count, error } = await query.order("full_name").range((page - 1) * pageSize, page * pageSize - 1);
  const children = (data ?? []) as Row[];
  const today = riyadhToday();
  const attendanceResult = children.length
    ? await client.from("attendance").select("child_id,status").eq("organization_id", org).eq("attendance_date", today).in("child_id", children.map(child => child.id))
    : { data: [] as { child_id: string; status: string }[] };
  const todayStatus = new Map((attendanceResult.data ?? []).map(row => [row.child_id, row.status]));
  const branchName = new Map(branches.map(item => [item.id, item.name]));
  const total = count ?? 0;
  const pageUrl = (target: number) => `/dashboard/children?${new URLSearchParams({ org, ...(search ? { q: search } : {}), ...(branch ? { branch } : {}), page: String(target) })}`;
  return <>
    <header className="page-head">
      <div><h1>الطلاب</h1><p>ملفات طلاب {orgName}: البيانات وأولياء الأمور والصحة والحضور.</p></div>
      <OrgSwitcher path="/dashboard/children" current={org} organizations={organizations} />
    </header>
    <form className="toolbar" role="search" style={{ marginBottom: 18, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
      <input type="hidden" name="org" value={org} />
      <label style={{ flex: "1 1 220px" }}>بحث بالاسم<input type="search" name="q" defaultValue={search} maxLength={60} /></label>
      {branches.length ? <label style={{ flex: "0 1 200px" }}>الفرع<select name="branch" defaultValue={branch ?? ""}><option value="">كل الفروع</option>{branches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
      <button type="submit" className="btn">عرض</button>
    </form>
    {error ? <p role="alert" className="info-banner">تعذر تحميل الطلاب. أعد تحميل الصفحة.</p> : <>
      <p className="hint" style={{ marginBottom: 12 }}>{total.toLocaleString("ar-SA")} طالب{search || branch ? " مطابق" : ""}</p>
      {children.length ? <div className="list">{children.map(child => {
        const status = todayStatus.get(child.id);
        return <Link key={child.id} className="list-row" href={`/dashboard/children/${child.id}?org=${encodeURIComponent(org)}`}>
          <span className="tile-icon tone-plum"><Icon name="child" /></span>
          <span className="body"><span className="title">{child.full_name}</span>
            <span className="sub">{[age(child.date_of_birth), child.branch_id ? branchName.get(child.branch_id) : null].filter(Boolean).join(" · ") || "بدون تفاصيل"}</span></span>
          {isAttendanceStatus(status) ? <span className={`chip-soft ${attendanceTone[status]}`}>{attendanceLabels[status]}</span> : <span className="chip-soft">لم يُسجّل اليوم</span>}
          <span className="chev" aria-hidden="true"><Icon name="arrowNext" /></span>
        </Link>;
      })}</div> : <p className="empty">{search || branch ? "ما فيه طلاب مطابقين." : "ما فيه طلاب بعد."}</p>}
      <nav aria-label="صفحات الطلاب" style={{ display: "flex", gap: 24, marginBlock: 16 }}>
        {page > 1 ? <Link href={pageUrl(page - 1)}>الصفحة السابقة</Link> : null}
        {page * pageSize < total ? <Link href={pageUrl(page + 1)}>الصفحة التالية</Link> : null}
      </nav>
    </>}
    {manager ? <section className="card" style={{ marginTop: 12 }}><details><summary>إضافة طالب جديد</summary>
      <div style={{ marginTop: 16 }}><StudentProfileForm organizationId={org} branches={branches} /></div>
    </details></section> : null}
  </>;
}
