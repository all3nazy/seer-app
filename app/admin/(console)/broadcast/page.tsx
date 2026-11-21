import { requestSession } from "../../../../lib/supabase/server";
import { currentAdminRole, mayOpen } from "../../../../lib/admin-role";
import { AdminNoAccess } from "../../../../components/admin-no-access";
import { BroadcastView, type BroadcastRow } from "../../../../components/admin-stage3-views";

export const metadata = { title: "رسالة للمشتركين" };

export default async function AdminBroadcast() {
  if (!(await mayOpen("/admin/broadcast"))) return <AdminNoAccess role={await currentAdminRole()} />;
  const { client } = await requestSession();
  const [history, plans, orgs] = await Promise.all([
    client.rpc("admin_broadcasts"),
    client.from("plans").select("id,name").order("sort_order"),
    client.from("organizations").select("id,name").order("name").limit(2000),
  ]);
  const options = (orgs.data ?? []) as { id: string; name: string }[];
  return <BroadcastView history={(history.data ?? []) as BroadcastRow[]} plans={(plans.data ?? []) as { id: string; name: string }[]} orgs={options} />;
}
