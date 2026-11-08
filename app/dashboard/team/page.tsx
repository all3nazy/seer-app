import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, sessionUser } from "../../../lib/supabase/server";
import { canManage } from "../../../lib/operations";
import { isRole, memberName, type Invitation, type Member } from "../../../lib/team";
import { TeamPanel } from "../../../components/team-panel";
import { ShareButtons } from "../../../components/share-buttons";
import { myTasksMessage } from "../../../lib/share";
import { siteOrigin } from "../../../lib/origin";

export const dynamic = "force-dynamic";
export const metadata = { title: "الفريق" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const client = await createSupabaseServerClient();
  const user = await sessionUser(client);
  if (!user) redirect("/login");
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
  const contacts = canManage(mine.role) ? await client.rpc("member_contacts", { org }) : { data: null, error: null };
  const contactRows = (contacts.data ?? []) as { user_id: string; email: string | null; phone: string | null }[];
  const myLink = `${await siteOrigin()}/dashboard/my?org=${encodeURIComponent(org)}`;
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
    {canManage(mine.role) && !membersResult.error ? <section className="card" style={{ marginTop: 24 }} aria-labelledby="links-title">
      <h2 id="links-title">إرسال رابط المهام للموظفين</h2>
      <p className="hint" style={{ marginBottom: 12 }}>كل موظف يفتح الرابط ويدخل بحسابه، ويشوف المهام المسندة له فقط. الرقم يسجّله الموظف من صفحة الإعدادات.</p>
      <ul className="records">{((membersResult.data ?? []) as Member[]).filter(member => member.user_id !== user.id).map(member => {
        const contact = contactRows.find(item => item.user_id === member.user_id);
        const message = myTasksMessage({ organization: name, link: myLink, name: member.display_name });
        return <li key={member.user_id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span>{memberName(member)}<span className="hint" style={{ display: "block" }} dir="ltr">{[contact?.phone, contact?.email].filter(Boolean).join(" · ") || "—"}</span></span>
          <ShareButtons compact phone={contact?.phone} email={contact?.email} subject={message.subject} body={message.body} />
        </li>;
      })}</ul>
    </section> : null}
  </div>;
}
