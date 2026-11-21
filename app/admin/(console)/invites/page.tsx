import { requestSession } from "../../../../lib/supabase/server";
import { OrgInvites, type InviteRow } from "../../../../components/org-invites";
import { appBase } from "../../../../lib/surface";

export const metadata = { title: "دعوات المنشآت" };

/** المشتركين › دعوات المنشآت: invite links for new organizations, moved here from the subscribers page. */
export default async function AdminInvites() {
  const { client } = await requestSession();
  const [invites, plans] = await Promise.all([client.rpc("admin_org_invites"), client.from("plans").select("id,key,name").order("sort_order")]);
  return <>
    <header className="page-head"><div><h1>دعوات المنشآت</h1><p>روابط تفعيل لمنشآت جديدة، تفتح على المنصة.</p></div></header>
    <OrgInvites invites={(invites.data ?? []) as InviteRow[]} plans={(plans.data ?? []) as { id: string; key: string; name: string }[]} appUrl={appBase()} />
  </>;
}
