import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { canManage } from "../../lib/operations";
import { riyadhToday } from "../../lib/tasks";
export const dynamic = "force-dynamic";
export const metadata = { title: "لوحة التشغيل" };

const roleNames: Record<string, string> = { owner: "مالك", admin: "مدير", staff: "موظف" };
function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Riyadh" }).format(new Date()));
  return hour < 12 ? "صباح الخير" : "مساء الخير";
}

export default async function Dashboard() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  const loadMemberships = () => supabase.from("memberships")
    .select("organization_id,role,organizations(name,type)").eq("user_id", user.id);
  let { data: memberships, error: membershipError } = await loadMemberships();
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
    const [open, late, pending, children, unpaid] = await Promise.all([
      count("tasks").neq("status", "done"),
      count("tasks").neq("status", "done").lt("due_date", today),
      count("enrollments").eq("status", "pending"),
      count("children"),
      manager ? count("invoices").eq("status", "issued") : Promise.resolve({ count: null, error: null }),
    ]);
    return {
      id: org, name: (membership.organizations as unknown as { name: string } | null)?.name ?? "منشأة",
      role: membership.role, manager,
      // Task counts stay optional so a missing task table never hides the rest of the brief.
      failed: Boolean(pending.error || children.error || unpaid.error),
      tasks: open.error ? null : { open: open.count ?? 0, late: late.error ? 0 : late.count ?? 0 },
      pending: pending.count ?? 0, children: children.count ?? 0, unpaid: unpaid.count,
    };
  }));
  const n = (value: number) => value.toLocaleString("ar-SA");
  return <>
    <header className="page-head"><div><p className="eyebrow-date">{new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Riyadh" }).format(new Date())}</p><h1>{greeting()}</h1></div></header>
    {membershipError ? <p role="alert">تعذر تحميل عضويات المنشآت. حاول مرة أخرى.</p> : null}
    {organizations.map(org => <section className="brief" key={org.id} aria-labelledby={`org-${org.id}`}>
      <h2 id={`org-${org.id}`}>{org.name}<span className="role">{roleNames[org.role] ?? "عضو"}</span></h2>
      {org.failed ? <p role="alert">تعذر تحميل بعض الأرقام. أعد تحميل الصفحة أو حاول لاحقًا.</p> : <p className="statement">
        {org.tasks ? org.tasks.open ? <>عندكم <Link href={`/dashboard/tasks?org=${encodeURIComponent(org.id)}`}><b>{n(org.tasks.open)}</b> مهام مفتوحة</Link>{org.tasks.late ? <>، <b className="hot">{n(org.tasks.late)}</b> منها متأخرة</> : null}. </> : <>كل المهام منجزة. </> : null}
        {org.pending ? <><Link href={`/dashboard/operations?org=${encodeURIComponent(org.id)}&entity=enrollments`}><b>{n(org.pending)}</b> طلبات تسجيل</Link> تنتظر الموافقة. </> : <>ما فيه طلبات تسجيل معلّقة. </>}
        {org.unpaid !== null ? org.unpaid ? <><b className="hot">{n(org.unpaid)}</b> فواتير ما انسددت. </> : <>الفواتير كلها مسددة. </> : null}
        <span className="quiet">وفي المنشأة <b>{n(org.children)}</b> طفل.</span>
      </p>}
      <nav className="text-links" aria-label={`روابط ${org.name}`}>
        <Link href={`/dashboard/tasks?${new URLSearchParams({ org: org.id })}`}>المهام</Link>
        <Link href={`/dashboard/operations?${new URLSearchParams({ org: org.id })}`}>السجلات</Link>
        <Link href="/dashboard/assistant">اسأل المساعد</Link>
      </nav>
    </section>)}
    {!membershipError && !organizations.length ? <section className="brief"><h2>حسابك غير مرتبط بمنشأة بعد</h2><p>اطلب من مسؤول المنصة إسناد حسابك إلى منشأة، ثم أعد تحميل الصفحة.</p></section> : null}
  </>;
}
