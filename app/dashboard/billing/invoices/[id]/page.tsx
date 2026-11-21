import { notFound } from "next/navigation";
import { loadOrgContext } from "../../../../../lib/org-context";
import { OrgUnavailable } from "../../../../../components/org-unavailable";
import { BackLink } from "../../../../../components/back-link";
import { InvoiceDocument, type InvoiceDoc } from "../../../../../components/admin-stage3-views";

export const dynamic = "force-dynamic";
export const metadata = { title: "إيصال وفاتورة سِير" };

/** A numbered receipt or invoice from Seer for the organization (owner only; RLS decides). Print or save as PDF. */
export default async function OwnerInvoice({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ org?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const context = await loadOrgContext((await searchParams).org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org } = context;
  const { data } = await client.from("platform_invoices").select("id,number,kind,organization_name,description,plan_name,months,period_start,period_end,base_amount,discount,coupon_code,amount,reference,note,issued_at")
    .eq("id", id).eq("organization_id", org).maybeSingle();
  if (!data) notFound();
  return <InvoiceDocument doc={data as InvoiceDoc} back={<BackLink href={`/dashboard/billing?org=${encodeURIComponent(org)}`} label="رجوع إلى الاشتراك" />} />;
}
