import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { canManage } from "../../lib/operations";
import { riyadhToday } from "../../lib/tasks";
import { Icon } from "../../components/icons";
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
    const queries = [
      { label: "مهام مفتوحة", query: count("tasks").neq("status", "done"), optional: true },
      { label: "مهام متأخرة", query: count("tasks").neq("status", "done").lt("due_date", today), alert: true, optional: true },
      { label: "الأطفال", query: count("children") },
      { label: "طلبات بانتظار الموافقة", query: count("enrollments").eq("status", "pending"), alert: true },
      { label: "الفروع", query: count("branches") },
      ...(manager ? [{ label: "فواتير غير مسددة", query: count("invoices").eq("status", "issued"), alert: true }] : []),
    ];
    const results = await Promise.all(queries.map(item => item.query));
    return {
      id: org, name: (membership.organizations as unknown as { name: string } | null)?.name ?? "منشأة",
      role: membership.role,
      // Task counts are optional until the task migration is applied; other failures are surfaced.
      failed: results.some((result, index) => result.error && !queries[index].optional),
      metrics: queries.map((query, index) => ({ label: query.label, alert: query.alert ?? false, count: results[index].error ? null : results[index].count })).filter(metric => metric.count !== null),
    };
  }));
  return <>
    <header className="page-head"><div><h1>{greeting()}</h1><p>هذا ملخص منشآتك اليوم.</p></div>
      <Link className="primary-button" href="/dashboard/tasks"><Icon name="board" />لوحة المهام</Link>
    </header>
    {membershipError ? <p role="alert">تعذر تحميل عضويات المنشآت. حاول مرة أخرى.</p> : null}
    <div className="stack">{organizations.map(org => <section className="card org-card" key={org.id} aria-labelledby={`org-${org.id}`}>
      <header><h2 id={`org-${org.id}`}>{org.name}</h2><span className="pill">{roleNames[org.role] ?? "عضو"}</span></header>
      {org.failed ? <p role="alert">تعذر تحميل بعض المؤشرات. أعد تحميل الصفحة أو حاول لاحقًا.</p> : <dl className="metrics">{org.metrics.map(metric => <div key={metric.label} className={`metric${metric.alert && metric.count ? " alert" : ""}`}><dt>{metric.label}</dt><dd>{(metric.count ?? 0).toLocaleString("ar-SA")}</dd></div>)}</dl>}
      <div className="link-row">
        <Link className="btn btn-sm" href={`/dashboard/tasks?${new URLSearchParams({ org: org.id })}`}><Icon name="board" />المهام</Link>
        <Link className="btn btn-sm" href={`/dashboard/operations?${new URLSearchParams({ org: org.id })}`}><Icon name="folder" />السجلات</Link>
        <Link className="btn btn-sm" href="/dashboard/assistant"><Icon name="spark" />اسأل المساعد</Link>
      </div>
    </section>)}</div>
    {!membershipError && !organizations.length ? <section className="card"><h2>حسابك غير مرتبط بمنشأة بعد</h2><p>اطلب من مسؤول المنصة إسناد حسابك إلى منشأة، ثم أعد تحميل الصفحة.</p></section> : null}
  </>;
}
