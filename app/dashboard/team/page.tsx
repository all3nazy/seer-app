import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { canManage } from "../../../lib/operations";
import { isRole, type Invitation, type Member } from "../../../lib/team";
import { TeamPanel } from "../../../components/team-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "الفريق" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: memberships, error: membershipError } = await client.from("memberships").select("organization_id,role,organizations(name)").eq("user_id", user.id);
  if (membershipError) return <><h1>تعذر تحميل المنشآت</h1><p role="alert">حاول مجددًا بعد قليل.</p></>;
  const params = await searchParams;
  const mine = memberships?.find(item => item.organization_id === params.org) ?? memberships?.[0];
  if (!mine || !isRole(mine.role)) return <section className="card"><h1>لا توجد منشأة مرتبطة</h1><p>اطلب من مسؤول المنصة ربط حسابك بمنشأة.</p></section>;
  const org = mine.organization_id as string;
  const name = (mine.organizations as unknown as { name: string } | null)?.name ?? "المنشأة";
  const [membersResult, invitationsResult] = await Promise.all([
    client.from("memberships").select("user_id,role,display_name").eq("organization_id", org).order("joined_at"),
    canManage(mine.role) ? client.rpc("list_member_invitations", { org }) : Promise.resolve({ data: null, error: null }),
  ]);
  return <div style={{ maxWidth: 760 }}>
    <header className="page-head">
      <div><h1>الفريق</h1><p>أعضاء {name} وصلاحياتهم.</p></div>
      {memberships && memberships.length > 1 ? <nav className="segments" aria-label="اختيار المنشأة">
        {memberships.map(item => <Link key={item.organization_id} href={`/dashboard/team?org=${encodeURIComponent(item.organization_id)}`} aria-current={item.organization_id === org ? "page" : undefined}>{(item.organizations as unknown as { name: string } | null)?.name ?? "منشأة"}</Link>)}
      </nav> : null}
    </header>
    {membersResult.error ? <p role="alert" className="info-banner">تعذر تحميل الفريق. إذا كانت هذه أول مرة، يلزم تطبيق ترحيل قاعدة البيانات الخاص بالفريق.</p>
      : <TeamPanel key={org} organizationId={org} organizationName={name} me={user.id} myRole={mine.role}
        members={(membersResult.data ?? []) as Member[]} invitations={invitationsResult.error ? null : (invitationsResult.data ?? []) as Invitation[]} />}
  </div>;
}
