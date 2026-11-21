import { requestSession } from "../../../../lib/supabase/server";
import { currentAdminRole, mayOpen } from "../../../../lib/admin-role";
import { AdminNoAccess } from "../../../../components/admin-no-access";
import { AuditView, type AuditRow } from "../../../../components/admin-stage3-views";
import { auditQuery, auditRpcArgs } from "../../../../lib/admin-stage3";

export const metadata = { title: "سجل العمليات" };

export default async function AdminAudit({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await mayOpen("/admin/audit"))) return <AdminNoAccess role={await currentAdminRole()} />;
  const query = auditQuery(await searchParams);
  const { client } = await requestSession();
  const [rows, filters, orgs] = await Promise.all([
    client.rpc("admin_audit_log", auditRpcArgs(query)),
    client.rpc("admin_audit_filters"),
    client.from("organizations").select("id,name").order("name").limit(1000),
  ]);
  return <AuditView rows={(rows.data ?? []) as AuditRow[]} query={query} filters={(filters.data ?? { actors: [], actions: [] }) as { actors: { id: string; email: string }[]; actions: string[] }}
    orgs={(orgs.data ?? []) as { id: string; name: string }[]} />;
}
