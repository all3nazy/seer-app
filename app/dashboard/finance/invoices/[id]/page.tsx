import Link from "next/link";
import { notFound } from "next/navigation";
import { loadOrgContext } from "../../../../../lib/org-context";
import { OrgUnavailable } from "../../../../../components/org-unavailable";
import { DeleteLineButton, DeletePaymentButton, InvoiceActions, InvoiceHeaderForm, InvoiceLineForm, PaymentForm } from "../../../../../components/finance-forms";
import { balance, feeKindLabels, invoiceLabel, invoiceStatusLabels, invoiceStatusTone, lineNet, paymentMethodLabels, sar, type Invoice, type InvoiceLine, type Payment } from "../../../../../lib/finance";
import { uuid } from "../../../../../lib/operations";
import { ShareDocument } from "../../../../../components/document-forms";
import { shareMessage } from "../../../../../lib/documents";
import { siteOrigin } from "../../../../../lib/origin";

export const dynamic = "force-dynamic";
export const metadata = { title: "فاتورة" };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ org?: string }> }) {
  const [{ id: rawId }, { org: requestedOrg }] = await Promise.all([params, searchParams]);
  let id: string;
  try { id = uuid(rawId); } catch { notFound(); }
  const context = await loadOrgContext(requestedOrg);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager } = context;
  if (!manager) return <section className="card"><h1>فاتورة</h1><p>المالية لمسؤول المنشأة فقط.</p></section>;
  const { data, error } = await client.from("invoices").select("id,number,title,status,guardian_id,child_id,issue_date,due_date,notes,vat_borne_by_state,subtotal,discount_total,vat_total,vat_relief,amount_sar,paid_total,created_at,share_token").eq("organization_id", org).eq("id", id).maybeSingle();
  if (error) return <section className="card"><h1>تعذر تحميل الفاتورة</h1><p role="alert">أعد تحميل الصفحة.</p></section>;
  if (!data) notFound();
  const invoice = data as Invoice & { share_token: string };
  const [lines, payments, items, kids, guardians, payer, profile, origin] = await Promise.all([
    client.from("invoice_lines").select("id,description,kind,quantity,unit_price,discount,vat_rate,fee_item_id").eq("organization_id", org).eq("invoice_id", id).order("sort_order").order("id"),
    client.from("payments").select("id,invoice_id,receipt_number,amount,method,paid_on,reference,notes,recorded_at,recorded_by").eq("organization_id", org).eq("invoice_id", id).order("receipt_number"),
    invoice.status === "draft" ? client.from("fee_items").select("id,name,kind,default_amount,vat_rate").eq("organization_id", org).eq("is_active", true).order("name") : Promise.resolve({ data: [] }),
    client.from("children").select("id,full_name").eq("organization_id", org).eq("status", "active").order("full_name").limit(1000),
    client.from("guardians").select("id,full_name").eq("organization_id", org).order("full_name").limit(1000),
    invoice.guardian_id ? client.from("guardians").select("phone").eq("organization_id", org).eq("id", invoice.guardian_id).maybeSingle() : Promise.resolve({ data: null }),
    client.from("organization_profiles").select("legal_name").eq("organization_id", org).maybeSingle(),
    siteOrigin(),
  ]);
  const link = `${origin}/d/${invoice.share_token}`;
  const lineRows = (lines.data ?? []) as InvoiceLine[];
  const paymentRows = (payments.data ?? []) as Payment[];
  const childOptions = ((kids.data ?? []) as { id: string; full_name: string }[]).map(row => ({ id: row.id, name: row.full_name }));
  const guardianOptions = ((guardians.data ?? []) as { id: string; full_name: string }[]).map(row => ({ id: row.id, name: row.full_name }));
  const orgParam = encodeURIComponent(org);
  const remaining = balance(invoice);
  const dayAgo = Date.now() - 86400_000;
  return <div style={{ display: "grid", gap: 24 }}>
    <header className="page-head" style={{ marginBottom: 0 }}>
      <div>
        <p className="hint"><Link href={`/dashboard/finance?org=${orgParam}&tab=invoices`}>الفواتير</Link> / {invoiceLabel(invoice)}</p>
        <h1>{invoice.title ?? invoiceLabel(invoice)}</h1>
        <p><span className={`chip-soft ${invoiceStatusTone[invoice.status] ?? ""}`}>{invoiceStatusLabels[invoice.status] ?? invoice.status}</span>
          {invoice.child_id ? <> · <Link href={`/dashboard/children/${invoice.child_id}?org=${orgParam}`}>{childOptions.find(row => row.id === invoice.child_id)?.name ?? "الطالب"}</Link></> : null}
          {invoice.guardian_id ? ` · ${guardianOptions.find(row => row.id === invoice.guardian_id)?.name ?? ""}` : ""}
          {invoice.due_date ? ` · يستحق ${new Date(invoice.due_date).toLocaleDateString("ar-SA", { timeZone: "UTC" })}` : ""}</p>
      </div>
      <InvoiceActions organizationId={org} invoice={invoice} />
    </header>

    {invoice.status === "issued" || invoice.status === "paid" ? <section className="card" aria-labelledby="share-title">
      <h2 id="share-title">المشاركة مع ولي الأمر</h2>
      <ShareDocument organizationId={org} kind="invoice" id={id} link={link} phone={(payer.data as { phone: string | null } | null)?.phone ?? null}
        message={shareMessage({ kind: "invoice", organization: (profile.data as { legal_name: string | null } | null)?.legal_name ?? orgName, number: invoice.number, recipient: invoice.guardian_id ? guardianOptions.find(row => row.id === invoice.guardian_id)?.name ?? null : null, total: sar(invoice.amount_sar), link })} />
      <p className="hint" style={{ marginTop: 10 }}>الرابط يعرض الفاتورة بهوية منشأتك مع المدفوعات والمتبقي ورقم الآيبان، بدون تسجيل دخول.</p>
    </section> : null}

    {invoice.status === "draft" ? <section className="card"><details><summary>بيانات الفاتورة</summary><div style={{ marginTop: 12 }}><InvoiceHeaderForm organizationId={org} invoice={invoice} childrenOptions={childOptions} guardians={guardianOptions} /></div></details></section> : null}

    <section className="card" aria-labelledby="lines-title">
      <h2 id="lines-title">البنود</h2>
      {lineRows.length ? <div className="table-wrap"><table className="links-table" style={{ width: "100%" }}>
        <thead><tr><th scope="col">البند</th><th scope="col">الكمية</th><th scope="col">السعر</th><th scope="col">الخصم</th><th scope="col">الضريبة</th><th scope="col">الصافي</th>{invoice.status === "draft" ? <th scope="col"><span className="sr-only">إجراء</span></th> : null}</tr></thead>
        <tbody>{lineRows.map(line => <tr key={line.id}>
          <td>{line.description} <span className="chip-soft">{feeKindLabels[line.kind]}</span></td><td>{Number(line.quantity).toLocaleString("ar-SA")}</td><td>{sar(line.unit_price)}</td>
          <td>{Number(line.discount) ? sar(line.discount) : "—"}</td><td>{Number(line.vat_rate).toLocaleString("ar-SA")}٪</td><td>{sar(lineNet(line))}</td>
          {invoice.status === "draft" ? <td><DeleteLineButton organizationId={org} invoiceId={id} lineId={line.id} /></td> : null}
        </tr>)}</tbody>
      </table></div> : <p className="hint">{lineRows.length === 0 && Number(invoice.amount_sar) > 0 ? "فاتورة قديمة بمبلغ إجمالي بدون بنود." : "ما فيه بنود بعد."}</p>}
      {invoice.status === "draft" ? <div style={{ marginTop: 16 }}><InvoiceLineForm organizationId={org} invoiceId={id} items={(items.data ?? []) as { id: string; name: string; kind: string; default_amount: number; vat_rate: number }[]} /></div> : null}
      <dl style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "6px 24px", justifyContent: "end", marginTop: 16 }}>
        {lineRows.length ? <>
          <dt>المجموع</dt><dd style={{ margin: 0 }}>{sar(invoice.subtotal)}</dd>
          {Number(invoice.discount_total) ? <><dt>الخصومات</dt><dd style={{ margin: 0 }}>− {sar(invoice.discount_total)}</dd></> : null}
          <dt>ضريبة القيمة المضافة</dt><dd style={{ margin: 0 }}>{sar(invoice.vat_total)}</dd>
          {Number(invoice.vat_relief) ? <><dt>ضريبة تتحمّلها الدولة</dt><dd style={{ margin: 0 }}>− {sar(invoice.vat_relief)}</dd></> : null}
        </> : null}
        <dt><strong>المطلوب</strong></dt><dd style={{ margin: 0 }}><strong>{sar(invoice.amount_sar)}</strong></dd>
        {Number(invoice.paid_total) ? <><dt>المدفوع</dt><dd style={{ margin: 0 }}>{sar(invoice.paid_total)}</dd><dt><strong>المتبقي</strong></dt><dd style={{ margin: 0 }}><strong>{sar(remaining)}</strong></dd></> : null}
      </dl>
    </section>

    {invoice.status !== "draft" ? <section className="card" aria-labelledby="payments-title">
      <h2 id="payments-title">المدفوعات</h2>
      {paymentRows.length ? <ul className="records">{paymentRows.map(payment => <li key={payment.id}>
        <span>إيصال {payment.receipt_number} — {sar(payment.amount)} — {paymentMethodLabels[payment.method] ?? payment.method} — {new Date(payment.paid_on).toLocaleDateString("ar-SA", { timeZone: "UTC" })}{payment.reference ? <span dir="ltr"> ({payment.reference})</span> : null}</span>
        <span style={{ display: "flex", gap: 8 }}>
          <a className="btn btn-sm" href={`/dashboard/finance/invoices/${id}/print?org=${orgParam}&receipt=${payment.id}`} target="_blank" rel="noreferrer">الإيصال</a>
          {Date.parse(payment.recorded_at) > dayAgo ? <DeletePaymentButton organizationId={org} invoiceId={id} paymentId={payment.id} /> : null}
        </span>
      </li>)}</ul> : <p className="hint">ما فيه مدفوعات.</p>}
      {invoice.status === "issued" && remaining > 0 ? <div style={{ marginTop: 16 }}><PaymentForm organizationId={org} invoiceId={id} balance={remaining} /></div> : null}
    </section> : null}
  </div>;
}
