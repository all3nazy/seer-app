import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { serviceClient } from "../../../../../lib/supabase/service";
import { exportOrganization } from "../../../../../lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Everything one organization holds, as one JSON file (data portability under PDPL, for a subscriber
 * who leaves). The database checks the owner role with two-step verification and logs the export in
 * that organization's log; the server then reads with the service role.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("طلب غير صالح", { status: 400 });
  const service = serviceClient();
  if (!service) return new NextResponse("مفتاح الخدمة غير مضبوط", { status: 503 });
  const client = await createSupabaseServerClient();
  const { data: name, error } = await client.rpc("admin_org_export", { org: id });
  if (error) return new NextResponse(error.code === "42501" ? "غير مسموح" : "ما لقيت المنشأة", { status: error.code === "42501" ? 403 : 404 });
  const tables = await exportOrganization(service, id);
  const members = ((tables.memberships ?? []) as { user_id: string }[]).map(row => row.user_id);
  const users: unknown[] = [];
  for (const user of members) {
    const { data } = await service.auth.admin.getUserById(user);
    if (data?.user) users.push({ id: data.user.id, email: data.user.email ?? null, phone: data.user.phone ?? null, created_at: data.user.created_at });
  }
  const body = JSON.stringify({ format: 1, organization: { id, name }, exported_at: new Date().toISOString(), note: "بيانات المنشأة كاملة من منصة سِير (JSON). الملفات المرفوعة (صور الإيصالات وغيرها) غير مشمولة.", members: users, tables }, null, 2);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="seer-org-${id.slice(0, 8)}-${day}.json"`, "cache-control": "no-store" } });
}
