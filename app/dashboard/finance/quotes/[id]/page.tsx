import Link from "next/link";
import { notFound } from "next/navigation";
import { loadOrgContext } from "../../../../../lib/org-context";
import { OrgUnavailable } from "../../../../../components/org-unavailable";
import { FinanceDocument } from "../../../../../components/finance-document";
import { DeleteQuoteLineButton, QuoteActions, QuoteLineForm, ShareDocument } from "../../../../../components/document-forms";
import { PrintButton } from "../../../../../components/print-button";
import { loadProfile, shortLink } from "../../../../../lib/documents-server";
import { quoteStatusLabels, quoteStatusTone, shareMessage, type DocLine, type QuoteStatus } from "../../../../../lib/documents";
import { feeKindLabels, sar } from "../../../../../lib/finance";
import { uuid } from "../../../../../lib/operations";
import { siteOrigin } from "../../../../../lib/origin";
import { BackLink } from "../../../../../components/back-link";

export const dynamic = "force-dynamic";
export const metadata = { title: "عرض سعر" };
type Quote = { id: string; number: number | null; status: QuoteStatus; title: string; guardian_id: string | null; child_id: string | null; recipient_name: string | null; recipient_phone: string | null; issue_date: string | null; valid_until: string | null; notes: string | null; subtotal: number; discount_total: number; vat_total: number; vat_relief: number; total: number; invoice_id: string | null; share_token: string };

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ org?: string }> }) {
  const [{ id: rawId }, { org: requested }] = await Promise.all([params, searchParams]);
  let id: string;
  try { id = uuid(rawId); } catch { notFound(); }
  const context = await loadOrgContext(requested);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager } = context;
  if (!manager) return <section className="card"><h1>عرض سعر</h1><p>لمالك المنشأة أو مديرها فقط.</p></section>;
  const { data } = await client.from("quotes").select("id,number,status,title,guardian_id,child_id,recipient_name,recipient_phone,issue_date,valid_until,notes,subtotal,discount_total,vat_total,vat_relief,total,invoice_id,share_token").eq("organization_id", org).eq("id", id).maybeSingle();
  if (!data) notFound();
  const quote = data as Quote;
  const [lines, guardian, child, profile, origin] = await Promise.all([
    client.from("quote_lines").select("id,description,kind,quantity,unit_price,discount,vat_rate").eq("organization_id", org).eq("quote_id", id).order("sort_order").order("id"),
    quote.guardian_id ? client.from("guardians").select("full_name,phone").eq("organization_id", org).eq("id", quote.guardian_id).maybeSingle() : Promise.resolve({ data: null }),
    quote.child_id ? client.from("children").select("full_name").eq("organization_id", org).eq("id", quote.child_id).maybeSingle() : Promise.resolve({ data: null }),
    loadProfile(client, org, orgName), siteOrigin(),
  ]);
  const lineRows = (lines.data ?? []) as (DocLine & { id: string })[];
  const payer = guardian.data as { full_name: string; phone: string | null } | null;
  const recipient = payer?.full_name ?? quote.recipient_name;
  const phone = payer?.phone ?? quote.recipient_phone;
  const orgParam = encodeURIComponent(org);
  const link = await shortLink(client, origin, `/d/${quote.share_token}`);
  return <div style={{ display: "grid", gap: 20 }}>
    <BackLink href={`/dashboard/finance/quotes?org=${orgParam}`} label="رجوع إلى عروض الأسعار" />
    <header className="page-head no-print" style={{ marginBottom: 0 }}><div>
      <p className="hint"><Link href={`/dashboard/finance/quotes?org=${orgParam}`}>عروض الأسعار</Link> / {quote.number ? `عرض رقم ${quote.number}` : "مسودة"}</p>
      <h1>{quote.title}</h1>
      <p><span className={`chip-soft ${quoteStatusTone[quote.status]}`}>{quoteStatusLabels[quote.status]}</span> · {recipient ?? "—"} · <strong>{sar(quote.total)}</strong>
        {quote.invoice_id ? <> · <Link href={`/dashboard/finance/invoices/${quote.invoice_id}?org=${orgParam}`}>فتح الفاتورة</Link></> : null}</p>
    </div><QuoteActions organizationId={org} quoteId={id} status={quote.status} canConvert={Boolean(quote.guardian_id || quote.child_id)} /></header>

    {quote.status === "draft" ? <section className="card no-print">
      <h2>البنود</h2>
      {lineRows.length ? <ul className="records">{lineRows.map(line => <li key={line.id}><span>{line.description} <span className="chip-soft">{feeKindLabels[line.kind]}</span> · {Number(line.quantity).toLocaleString("ar-SA")} × {sar(line.unit_price)}{Number(line.discount) ? ` − ${sar(line.discount)}` : ""}</span><DeleteQuoteLineButton organizationId={org} quoteId={id} lineId={line.id} /></li>)}</ul> : <p className="hint">ما فيه بنود.</p>}
      <div style={{ marginTop: 14 }}><QuoteLineForm organizationId={org} quoteId={id} /></div>
      <p className="hint" style={{ marginTop: 10 }}>بعد «اعتماد وإرسال» يأخذ العرض رقمه ويتجمّد، ويصير رابط المشاركة فعّال.</p>
    </section> : <section className="card no-print">
      <h2>المشاركة</h2>
      <ShareDocument organizationId={org} kind="quote" id={id} link={link} phone={phone} message={shareMessage({ kind: "quote", organization: profile.legal_name ?? orgName, number: quote.number, recipient, total: sar(quote.total), link })} />
    </section>}

    <div className="doc-toolbar no-print"><PrintButton /></div>
    <FinanceDocument kind="quote" profile={profile} lines={lineRows}
      doc={{ number: quote.number, title: quote.title, status: quote.status, issue_date: quote.issue_date, due_date: quote.valid_until, notes: quote.notes, subtotal: quote.subtotal, discount_total: quote.discount_total, vat_total: quote.vat_total, vat_relief: quote.vat_relief, total: quote.total, paid_total: 0, child: (child.data as { full_name: string } | null)?.full_name ?? null, recipient }} />
  </div>;
}
