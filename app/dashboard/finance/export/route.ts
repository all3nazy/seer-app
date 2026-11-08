import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { canManage } from "../../../../lib/operations";
import { toCsv } from "../../../../lib/audit";
import { paymentMethodLabels, type PaymentMethod } from "../../../../lib/finance";
import { isIsoDate, riyadhToday } from "../../../../lib/students";

export const dynamic = "force-dynamic";

/** Payments in a date range as CSV, for the accountant. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return new NextResponse("Unauthorized", { status: 401 });
  const org = params.get("org") ?? "";
  const { data: member } = await client.from("memberships").select("role").eq("organization_id", org).eq("user_id", user.id).maybeSingle();
  if (!member || !canManage(member.role)) return new NextResponse("Forbidden", { status: 403 });
  const today = riyadhToday();
  const from = isIsoDate(params.get("from")) ? params.get("from") as string : `${today.slice(0, 8)}01`;
  const to = isIsoDate(params.get("to")) ? params.get("to") as string : today;
  const [payments, invoices, children, guardians] = await Promise.all([
    client.from("payments").select("receipt_number,amount,method,paid_on,reference,invoice_id").eq("organization_id", org).gte("paid_on", from).lte("paid_on", to).order("paid_on").order("receipt_number").limit(20000),
    client.from("invoices").select("id,number,title,child_id,guardian_id").eq("organization_id", org).limit(50000),
    client.from("children").select("id,full_name").eq("organization_id", org).limit(20000),
    client.from("guardians").select("id,full_name").eq("organization_id", org).limit(20000),
  ]);
  if (payments.error) return new NextResponse("Payments unavailable", { status: 500 });
  const invoiceById = new Map(((invoices.data ?? []) as { id: string; number: number | null; title: string | null; child_id: string | null; guardian_id: string | null }[]).map(row => [row.id, row]));
  const childName = new Map(((children.data ?? []) as { id: string; full_name: string }[]).map(row => [row.id, row.full_name]));
  const guardianName = new Map(((guardians.data ?? []) as { id: string; full_name: string }[]).map(row => [row.id, row.full_name]));
  const rows = ((payments.data ?? []) as { receipt_number: number; amount: number; method: PaymentMethod; paid_on: string; reference: string | null; invoice_id: string }[]).map(row => {
    const invoice = invoiceById.get(row.invoice_id);
    return [row.receipt_number, row.paid_on, Number(row.amount).toFixed(2), paymentMethodLabels[row.method] ?? row.method, row.reference,
      invoice?.number ?? null, invoice?.title ?? null, invoice?.child_id ? childName.get(invoice.child_id) ?? null : null, invoice?.guardian_id ? guardianName.get(invoice.guardian_id) ?? null : null];
  });
  const csv = toCsv([["رقم الإيصال", "تاريخ السداد", "المبلغ (ر.س)", "طريقة الدفع", "المرجع", "رقم الفاتورة", "عنوان الفاتورة", "الطالب", "ولي الأمر"], ...rows]);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="payments-${from}-${to}.csv"`, "Cache-Control": "private, no-store" } });
}
