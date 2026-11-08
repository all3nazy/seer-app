import { notFound } from "next/navigation";
import { loadOrgContext } from "../../../../../../lib/org-context";
import { OrgUnavailable } from "../../../../../../components/org-unavailable";
import { PrintButton } from "../../../../../../components/print-button";
import { FinanceDocument } from "../../../../../../components/finance-document";
import { loadProfile } from "../../../../../../lib/documents-server";
import type { DocLine } from "../../../../../../lib/documents";
import type { Invoice, Payment } from "../../../../../../lib/finance";
import { uuid } from "../../../../../../lib/operations";

export const dynamic = "force-dynamic";
export const metadata = { title: "طباعة" };

/** Printable invoice, or a receipt for one payment, in the organization's own branding. These are
 *  internal financial documents, not ZATCA-cleared tax invoices; the footer says so. */
export default async function PrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ org?: string; receipt?: string }> }) {
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  let id: string;
  try { id = uuid(rawId); } catch { notFound(); }
  const context = await loadOrgContext(query.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager } = context;
  if (!manager) notFound();
  const { data } = await client.from("invoices").select("id,number,title,status,guardian_id,child_id,issue_date,due_date,notes,vat_borne_by_state,subtotal,discount_total,vat_total,vat_relief,amount_sar,paid_total,created_at").eq("organization_id", org).eq("id", id).maybeSingle();
  if (!data || !(data as Invoice).number) notFound();
  const invoice = data as Invoice;
  const [lines, payments, child, guardian, profile] = await Promise.all([
    client.from("invoice_lines").select("description,kind,quantity,unit_price,discount,vat_rate").eq("organization_id", org).eq("invoice_id", id).order("sort_order").order("id"),
    client.from("payments").select("id,invoice_id,receipt_number,amount,method,paid_on,reference,notes,recorded_at,recorded_by").eq("organization_id", org).eq("invoice_id", id).order("receipt_number"),
    invoice.child_id ? client.from("children").select("full_name").eq("organization_id", org).eq("id", invoice.child_id).maybeSingle() : Promise.resolve({ data: null }),
    invoice.guardian_id ? client.from("guardians").select("full_name").eq("organization_id", org).eq("id", invoice.guardian_id).maybeSingle() : Promise.resolve({ data: null }),
    loadProfile(client, org, orgName),
  ]);
  const paymentRows = (payments.data ?? []) as Payment[];
  const receipt = query.receipt ? paymentRows.find(row => row.id === query.receipt) : undefined;
  if (query.receipt && !receipt) notFound();
  return <div style={{ padding: "8px 0 32px" }}>
    <div className="doc-toolbar no-print"><PrintButton /></div>
    <FinanceDocument kind={receipt ? "receipt" : "invoice"} profile={profile} lines={(lines.data ?? []) as DocLine[]}
      payments={paymentRows.map(row => ({ receipt_number: row.receipt_number, amount: row.amount, method: row.method, paid_on: row.paid_on }))}
      receipt={receipt ? { receipt_number: receipt.receipt_number, amount: receipt.amount, method: receipt.method, paid_on: receipt.paid_on, reference: receipt.reference } : undefined}
      doc={{ number: invoice.number, title: invoice.title, status: invoice.status, issue_date: invoice.issue_date, due_date: invoice.due_date, notes: invoice.notes, subtotal: invoice.subtotal, discount_total: invoice.discount_total, vat_total: invoice.vat_total, vat_relief: invoice.vat_relief, total: invoice.amount_sar, paid_total: invoice.paid_total,
        child: (child.data as { full_name: string } | null)?.full_name ?? null, recipient: (guardian.data as { full_name: string } | null)?.full_name ?? null }} />
  </div>;
}
