import { requestSession } from "../../../../lib/supabase/server";
import { currentAdminRole, mayOpen } from "../../../../lib/admin-role";
import { AdminNoAccess } from "../../../../components/admin-no-access";
import { SecurityView, type SecurityData } from "../../../../components/admin-stage3-views";

export const metadata = { title: "أمان الدخول" };

/** «أمان الدخول»: locks (24 hours or 7 days) with «فك القفل», the IPs failing most, and the block list. */
export default async function AdminSecurity({ searchParams }: { searchParams: Promise<{ window?: string; block?: string }> }) {
  if (!(await mayOpen("/admin/security"))) return <AdminNoAccess role={await currentAdminRole()} />;
  const params = await searchParams;
  const { client } = await requestSession();
  const { data } = await client.rpc("admin_login_security", { p_window: params.window === "7d" ? "7d" : "24h" });
  const block = /^[0-9a-fA-F:.]{3,45}$/.test(params.block ?? "") ? params.block! : "";
  return <SecurityView data={(data ?? null) as SecurityData | null} blockIp={block} />;
}
