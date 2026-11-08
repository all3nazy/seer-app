import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient, authUser } from "../../../../../lib/supabase/server";
import { canManage } from "../../../../../lib/operations";
import { toCsv } from "../../../../../lib/audit";
import { payrollCsvRows } from "../../../../../lib/hr";

export const dynamic = "force-dynamic";

/** Approved payroll as a bank transfer sheet. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const client = await createSupabaseServerClient();
  const { data: { user } } = await authUser(client);
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const org = params.get("org") ?? "", month = params.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new NextResponse("Bad month", { status: 400 });
  const { data: member } = await client.from("memberships").select("role").eq("organization_id", org).eq("user_id", user.id).maybeSingle();
  if (!member || !canManage(member.role)) return new NextResponse("Forbidden", { status: 403 });
  const { data: run } = await client.from("payroll_runs").select("id,status").eq("organization_id", org).eq("period", `${month}-01`).maybeSingle();
  if (!run || run.status !== "approved") return new NextResponse("Payroll not approved", { status: 404 });
  const { data: lines } = await client.from("payroll_lines").select("full_name,iban,net").eq("run_id", run.id).order("full_name");
  return new NextResponse(toCsv(payrollCsvRows((lines ?? []) as { full_name: string; iban: string | null; net: number }[])), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="payroll-${month}.csv"`, "Cache-Control": "private, no-store" },
  });
}
