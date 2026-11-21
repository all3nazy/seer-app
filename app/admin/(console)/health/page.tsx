import { requestSession } from "../../../../lib/supabase/server";
import { currentAdminRole, mayOpen } from "../../../../lib/admin-role";
import { AdminNoAccess } from "../../../../components/admin-no-access";
import { HealthView, type HealthData } from "../../../../components/admin-stage4-views";
import { adminBase, appBase } from "../../../../lib/surface";
import { supabaseDashboard } from "../../../../lib/admin-stage4";

export const metadata = { title: "صحة النظام" };

export default async function AdminHealth() {
  if (!(await mayOpen("/admin/health"))) return <AdminNoAccess role={await currentAdminRole()} />;
  const { client } = await requestSession();
  const { data } = await client.rpc("admin_system_health");
  return <HealthView data={(data ?? null) as HealthData | null} site={{ app: appBase(), admin: adminBase() ?? "" }}
    links={{ supabase: supabaseDashboard(process.env.NEXT_PUBLIC_SUPABASE_URL), vercel: "https://vercel.com/dashboard" }} />;
}
