import { requestSession } from "../../../../lib/supabase/server";
import { currentAdminRole, mayOpen } from "../../../../lib/admin-role";
import { AdminNoAccess } from "../../../../components/admin-no-access";
import { TeamView, type TeamRow } from "../../../../components/admin-stage3-views";

export const metadata = { title: "فريق الإدارة" };

export default async function AdminTeam() {
  if (!(await mayOpen("/admin/team"))) return <AdminNoAccess role={await currentAdminRole()} />;
  const { client } = await requestSession();
  const { data } = await client.rpc("admin_team");
  return <TeamView team={(data ?? []) as TeamRow[]} />;
}
