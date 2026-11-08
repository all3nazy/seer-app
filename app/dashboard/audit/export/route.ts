import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient, authUser } from "../../../../lib/supabase/server";
import { canManage } from "../../../../lib/operations";
import { applyAuditFilters, auditActionLabels, auditEntityLabels, auditFilters, toCsv, type AuditEvent } from "../../../../lib/audit";
import { memberName, type Member } from "../../../../lib/team";

export const dynamic = "force-dynamic";
const maxRows = 10000;

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await authUser(client);
  if (error || !user) return new NextResponse("Unauthorized", { status: 401 });
  const org = params.org ?? "";
  const { data: member } = await client.from("memberships").select("role").eq("organization_id", org).eq("user_id", user.id).maybeSingle();
  if (!member || !canManage(member.role)) return new NextResponse("Forbidden", { status: 403 });
  const filters = auditFilters(params);
  const [eventsResult, membersResult] = await Promise.all([
    applyAuditFilters(client.from("audit_events").select("id,actor_id,entity,record_id,action,created_at").eq("organization_id", org), filters)
      .order("created_at", { ascending: false }).limit(maxRows),
    client.from("memberships").select("user_id,role,display_name").eq("organization_id", org),
  ]);
  if (eventsResult.error) return new NextResponse("Audit log unavailable", { status: 500 });
  const members = (membersResult.data ?? []) as Member[];
  const rows = ((eventsResult.data ?? []) as AuditEvent[]).map(event => [
    new Date(event.created_at).toLocaleString("en-CA", { timeZone: "Asia/Riyadh", hour12: false }),
    auditEntityLabels[event.entity] ?? event.entity,
    auditActionLabels[event.action] ?? event.action,
    event.actor_id ? memberName(members.find(item => item.user_id === event.actor_id)) : "النظام",
    event.record_id,
  ]);
  const csv = toCsv([["الوقت (الرياض)", "القسم", "العملية", "المنفّذ", "معرّف السجل"], ...rows]);
  return new NextResponse(csv, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="audit-log.csv"`,
    "Cache-Control": "private, no-store",
  } });
}
