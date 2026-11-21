import { requestSession } from "../../../../lib/supabase/server";
import { currentAdminRole, mayOpen } from "../../../../lib/admin-role";
import { AdminNoAccess } from "../../../../components/admin-no-access";
import { BackupsView, type BackupRow } from "../../../../components/admin-stage4-views";

export const metadata = { title: "النسخ الاحتياطي" };
// «نسخة الحين» runs the whole backup in the server action.
export const maxDuration = 300;

export default async function AdminBackups() {
  if (!(await mayOpen("/admin/backups"))) return <AdminNoAccess role={await currentAdminRole()} />;
  const { client } = await requestSession();
  const { data } = await client.rpc("admin_backups");
  return <BackupsView runs={(data ?? []) as BackupRow[]} />;
}
