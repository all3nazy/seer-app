import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { canManage } from "../../lib/operations";
import SignOutButton from "../../components/sign-out-button";
export const dynamic = "force-dynamic";

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
  const organizations = await Promise.all((memberships ?? []).map(async membership => {
    const org = membership.organization_id;
    const manager = canManage(membership.role);
    const queries = [
      { label: "الأطفال", query: supabase.from("children").select("id", { count: "exact", head: true }).eq("organization_id", org) },
      { label: "طلبات التسجيل", query: supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("organization_id", org) },
      { label: "طلبات بانتظار الموافقة", query: supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "pending") },
      { label: "الفروع", query: supabase.from("branches").select("id", { count: "exact", head: true }).eq("organization_id", org) },
      ...(manager ? [
        { label: "الفواتير", query: supabase.from("invoices").select("id", { count: "exact", head: true }).eq("organization_id", org) },
        { label: "فواتير صادرة غير مسددة", query: supabase.from("invoices").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "issued") },
      ] : []),
    ];
    const results = await Promise.all(queries.map(item => item.query));
    return {
      id: org, name: (membership.organizations as unknown as { name: string } | null)?.name ?? "منشأة",
      role: membership.role, failed: results.some(result => result.error),
      metrics: queries.map((query, index) => ({ label: query.label, count: results[index].count })),
    };
  }));
  return <main className="shell" id="main-content">
    <header className="top"><Link className="logo" href="/">سِير.</Link><nav aria-label="التنقل الرئيسي" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}><Link href="/dashboard/operations">إدارة العمليات</Link><Link href="/dashboard/assistant">المساعد التشغيلي</Link><SignOutButton /></nav></header>
    <section className="hero"><h1>لوحة التشغيل</h1><p>ملخص المنشآت التي تملك صلاحية الاطلاع عليها.</p></section>
    {membershipError ? <p role="alert">تعذر تحميل عضويات المنشآت. حاول مرة أخرى.</p> : null}
    <div className="grid">{organizations.map(org => <section className="card" key={org.id}>
      <h2>{org.name}</h2><p>الصلاحية: {org.role === "owner" ? "مالك" : org.role === "admin" ? "مدير" : "موظف"}</p>
      {org.failed ? <p role="alert">تعذر تحميل بعض المؤشرات. أعد تحميل الصفحة أو حاول لاحقًا.</p> : <dl style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>{org.metrics.map(metric => <div key={metric.label}><dt style={{ fontSize: 13, color: "#4e655c" }}>{metric.label}</dt><dd style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{(metric.count ?? 0).toLocaleString("ar-SA")}</dd></div>)}</dl>}
      <Link href={`/dashboard/operations?${new URLSearchParams({ org: org.id })}`}>إدارة عمليات المنشأة</Link>
    </section>)}</div>
    {!membershipError && !organizations.length ? <section className="card"><h2>لا توجد منشآت مرتبطة</h2><p>يلزم إسناد حسابك إلى منشأة من مسؤول المنصة.</p></section> : null}
  </main>;
}
