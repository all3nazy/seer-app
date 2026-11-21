import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { auditLabel } from "../../../../lib/admin-format";
import { auditDetail, auditQuery, auditRpcArgs, toCsv } from "../../../../lib/admin-stage3";
import { formatDateTime } from "../../../../lib/dates";

export const dynamic = "force-dynamic";
const MAX_ROWS = 5000;

/**
 * The operations log as CSV (same filters as the page, up to 5,000 rows). The database checks the
 * role and two-step verification, and the export itself is written to the log.
 */
export async function GET(request: NextRequest) {
  const query = auditQuery(Object.fromEntries(request.nextUrl.searchParams));
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("admin_audit_log", auditRpcArgs(query, MAX_ROWS, 1));
  if (error) return new NextResponse(error.code === "42501" ? "غير مسموح" : "تعذر التصدير", { status: error.code === "42501" ? 403 : 500 });
  const rows = (data ?? []) as { created_at: string; actor: string | null; action: string; organization: string | null; detail: Record<string, unknown> | null }[];
  await client.rpc("admin_audit_exported", { p_rows: rows.length });
  const csv = toCsv([["الوقت", "العملية", "الرمز", "المنشأة", "من", "التفاصيل"],
    ...rows.map(row => [formatDateTime(row.created_at), auditLabel(row.action), row.action, row.organization ?? "", row.actor ?? "", auditDetail(row.detail)])]);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="seer-audit-${day}.csv"`, "cache-control": "no-store" } });
}
