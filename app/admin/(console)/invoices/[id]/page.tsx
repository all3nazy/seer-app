import { notFound } from "next/navigation";
import { requestSession } from "../../../../../lib/supabase/server";
import { currentAdminRole, mayOpen } from "../../../../../lib/admin-role";
import { AdminNoAccess } from "../../../../../components/admin-no-access";
import { InvoiceDocument, type InvoiceDoc } from "../../../../../components/admin-stage3-views";
import { BackLink } from "../../../../../components/back-link";

export const metadata = { title: "فاتورة" };

/** One receipt or invoice, printable (also «حفظ PDF» from the print dialog). */
export default async function AdminInvoice({ params }: { params: Promise<{ id: string }> }) {
  if (!(await mayOpen("/admin/invoices"))) return <AdminNoAccess role={await currentAdminRole()} />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { client } = await requestSession();
  const { data } = await client.from("platform_invoices").select("id,number,kind,organization_id,organization_name,description,plan_name,months,period_start,period_end,base_amount,discount,coupon_code,amount,reference,note,issued_at").eq("id", id).maybeSingle();
  if (!data) notFound();
  return <InvoiceDocument doc={data as InvoiceDoc} back={<BackLink href="/admin/invoices" label="رجوع إلى الفواتير" />} />;
}
