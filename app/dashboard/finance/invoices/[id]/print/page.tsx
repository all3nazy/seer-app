import { notFound } from "next/navigation";
import { loadOrgContext } from "../../../../../../lib/org-context";
import { OrgUnavailable } from "../../../../../../components/org-unavailable";
import { PrintButton } from "../../../../../../components/print-button";
import { feeKindLabels, invoiceStatusLabels, lineNet, paymentMethodLabels, sar, type Invoice, type InvoiceLine, type Payment } from "../../../../../../lib/finance";
import { uuid } from "../../../../../../lib/operations";

export const dynamic = "force-dynamic";
export const metadata = { title: "طباعة" };
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("ar-SA", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }) : "—";

/** Printable invoice, or a receipt for one payment. These are internal financial documents,
 *  not ZATCA-cleared tax invoices; the footer says so. */
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
  const [lines, payments, child, guardian] = await Promise.all([
    client.from("invoice_lines").select("id,description,kind,quantity,unit_price,discount,vat_rate,fee_item_id").eq("organization_id", org).eq("invoice_id", id).order("sort_order").order("id"),
    client.from("payments").select("id,invoice_id,receipt_number,amount,method,paid_on,reference,notes,recorded_at,recorded_by").eq("organization_id", org).eq("invoice_id", id).order("receipt_number"),
    invoice.child_id ? client.from("children").select("full_name,national_id").eq("organization_id", org).eq("id", invoice.child_id).maybeSingle() : Promise.resolve({ data: null }),
    invoice.guardian_id ? client.from("guardians").select("full_name,phone").eq("organization_id", org).eq("id", invoice.guardian_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const paymentRows = (payments.data ?? []) as Payment[];
  const receipt = query.receipt ? paymentRows.find(row => row.id === query.receipt) : undefined;
  if (query.receipt && !receipt) notFound();
  const kid = child.data as { full_name: string; national_id: string | null } | null;
  const payer = guardian.data as { full_name: string; phone: string | null } | null;
  const cell = { padding: "8px 10px", borderBottom: "1px solid #ddd", textAlign: "start" as const };
  return <article style={{ maxWidth: 760, margin: "0 auto", padding: 32, background: "#fff", color: "#111", fontSize: 14, lineHeight: 1.6 }}>
    <style>{`@media print { .no-print, .sidebar, .tabbar, .mobile-bar { display: none !important; } body { background: #fff !important; } .main { padding: 0 !important; } }`}</style>
    <div className="no-print" style={{ marginBottom: 16 }}><PrintButton /></div>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 16, borderBottom: "2px solid #111", paddingBottom: 12, marginBottom: 16 }}>
      <div><h1 style={{ margin: 0, fontSize: 22 }}>{orgName}</h1><p style={{ margin: 0 }}>{receipt ? "إيصال استلام" : "فاتورة"}</p></div>
      <div style={{ textAlign: "end" }}>
        {receipt ? <><strong>إيصال رقم {receipt.receipt_number}</strong><br />{date(receipt.paid_on)}</> : <><strong>فاتورة رقم {invoice.number}</strong><br />الإصدار: {date(invoice.issue_date)}<br />الاستحقاق: {date(invoice.due_date)}</>}
      </div>
    </header>
    <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
      <div><strong>الطالب</strong><br />{kid?.full_name ?? "—"}{kid?.national_id ? <><br />الهوية: <span dir="ltr">{kid.national_id}</span></> : null}</div>
      <div><strong>ولي الأمر</strong><br />{payer?.full_name ?? "—"}{payer?.phone ? <><br /><span dir="ltr">{payer.phone}</span></> : null}</div>
    </section>
    {receipt ? <section>
      <p>استلمنا من {payer?.full_name ?? "ولي الأمر"} مبلغ <strong>{sar(receipt.amount)}</strong> بطريقة {paymentMethodLabels[receipt.method] ?? receipt.method}{receipt.reference ? <> (مرجع <span dir="ltr">{receipt.reference}</span>)</> : null}، عن فاتورة رقم {invoice.number}{invoice.title ? ` (${invoice.title})` : ""}.</p>
      <p>المتبقي على الفاتورة بعد كل المدفوعات المسجّلة: <strong>{sar(Number(invoice.amount_sar) - Number(invoice.paid_total))}</strong></p>
    </section> : <>
      {invoice.title ? <h2 style={{ fontSize: 16 }}>{invoice.title}</h2> : null}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead><tr><th style={cell}>البند</th><th style={cell}>الكمية</th><th style={cell}>السعر</th><th style={cell}>الخصم</th><th style={cell}>الضريبة</th><th style={cell}>الصافي</th></tr></thead>
        <tbody>{((lines.data ?? []) as InvoiceLine[]).map(line => <tr key={line.id}><td style={cell}>{line.description} ({feeKindLabels[line.kind]})</td><td style={cell}>{Number(line.quantity)}</td><td style={cell}>{sar(line.unit_price)}</td><td style={cell}>{Number(line.discount) ? sar(line.discount) : "—"}</td><td style={cell}>{Number(line.vat_rate)}٪</td><td style={cell}>{sar(lineNet(line))}</td></tr>)}</tbody>
      </table>
      <table style={{ marginInlineStart: "auto", borderCollapse: "collapse" }}><tbody>
        <tr><td style={cell}>المجموع</td><td style={cell}>{sar(invoice.subtotal)}</td></tr>
        {Number(invoice.discount_total) ? <tr><td style={cell}>الخصومات</td><td style={cell}>− {sar(invoice.discount_total)}</td></tr> : null}
        <tr><td style={cell}>ضريبة القيمة المضافة</td><td style={cell}>{sar(invoice.vat_total)}</td></tr>
        {Number(invoice.vat_relief) ? <tr><td style={cell}>ضريبة الرسوم الدراسية تتحمّلها الدولة عن المواطن</td><td style={cell}>− {sar(invoice.vat_relief)}</td></tr> : null}
        <tr><td style={cell}><strong>المطلوب</strong></td><td style={cell}><strong>{sar(invoice.amount_sar)}</strong></td></tr>
        {Number(invoice.paid_total) ? <><tr><td style={cell}>المدفوع</td><td style={cell}>{sar(invoice.paid_total)}</td></tr><tr><td style={cell}><strong>المتبقي</strong></td><td style={cell}><strong>{sar(Number(invoice.amount_sar) - Number(invoice.paid_total))}</strong></td></tr></> : null}
      </tbody></table>
      <p>الحالة: {invoiceStatusLabels[invoice.status] ?? invoice.status}</p>
      {invoice.notes ? <p style={{ whiteSpace: "pre-wrap" }}>{invoice.notes}</p> : null}
    </>}
    <footer style={{ marginTop: 32, borderTop: "1px solid #ddd", paddingTop: 8, fontSize: 12, color: "#555" }}>
      مستند داخلي صادر من سِير. ليس فاتورة ضريبية إلكترونية معتمدة من هيئة الزكاة والضريبة والجمارك.
    </footer>
  </article>;
}
