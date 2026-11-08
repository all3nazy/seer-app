import { docLabel, onColor, type DocData, type DocKind, type DocLine, type DocPayment, type OrgProfile } from "../lib/documents";
import { feeKindLabels, paymentMethodLabels, sar, type PaymentMethod } from "../lib/finance";

const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("ar-SA", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }) : "—";
const net = (line: DocLine) => Math.round(Number(line.quantity) * Number(line.unit_price) * 100) / 100 - Number(line.discount);
const stamps: Record<string, string> = { paid: "مسددة", draft: "مسودة", void: "ملغاة", accepted: "مقبول", rejected: "مرفوض", invoiced: "تحوّل لفاتورة" };

/**
 * One branded layout for invoices, receipts and quotes, used in the dashboard, for printing, and
 * on the private share page. Colours and logo come from the organization's profile.
 */
export function FinanceDocument({ kind, profile, doc, lines, payments = [], receipt }: {
  kind: DocKind; profile: OrgProfile; doc: DocData; lines: DocLine[]; payments?: DocPayment[];
  receipt?: DocPayment & { reference?: string | null };
}) {
  const brand = /^#[0-9A-Fa-f]{6}$/.test(profile.brand_color) ? profile.brand_color : "#3E1657";
  const ink = onColor(brand);
  const remaining = Math.round((Number(doc.total) - Number(doc.paid_total)) * 100) / 100;
  const facts = [
    profile.cr_number ? ["السجل التجاري", profile.cr_number] : null,
    profile.vat_number ? ["الرقم الضريبي", profile.vat_number] : null,
    profile.license_number ? ["الترخيص", profile.license_number] : null,
  ].filter(Boolean) as [string, string][];
  const contact = [[profile.address, profile.city].filter(Boolean).join("، "), profile.phone, profile.email, profile.website?.replace(/^https:\/\//, "")].filter(Boolean) as string[];
  const stamp = kind === "receipt" ? null : stamps[doc.status];
  const showBank = Boolean(profile.iban) && (kind === "quote" || (kind === "invoice" && remaining > 0));
  return <article className="fdoc" style={{ ["--brand" as string]: brand, ["--on-brand" as string]: ink }} dir="rtl" lang="ar">
    <header className="fdoc-head">
      <div className="fdoc-org">
        {profile.logo_data ? <img src={profile.logo_data} alt={`شعار ${profile.name}`} className="fdoc-logo" /> : <span className="fdoc-monogram" aria-hidden="true">{profile.name.trim().charAt(0)}</span>}
        <div><strong>{profile.legal_name ?? profile.name}</strong>{profile.legal_name && profile.legal_name !== profile.name ? <span>{profile.name}</span> : null}</div>
      </div>
      <div className="fdoc-title">
        <span>{kind === "quote" ? "عرض سعر" : kind === "receipt" ? "إيصال استلام" : "فاتورة"}</span>
        <strong>{kind === "receipt" && receipt ? `رقم ${receipt.receipt_number}` : doc.number ? `رقم ${doc.number}` : "مسودة"}</strong>
      </div>
    </header>
    {facts.length || contact.length ? <div className="fdoc-facts">
      {facts.map(([label, value]) => <span key={label}>{label}: <b dir="ltr">{value}</b></span>)}
      {contact.map(value => <span key={value} dir="auto">{value}</span>)}
    </div> : null}

    <section className="fdoc-parties">
      <div><span>{kind === "quote" ? "مقدّم إلى" : "ولي الأمر"}</span><strong>{doc.recipient ?? "—"}</strong></div>
      <div><span>الطالب</span><strong>{doc.child ?? "—"}</strong></div>
      {kind === "receipt" && receipt ? <div><span>تاريخ السداد</span><strong>{date(receipt.paid_on)}</strong></div> : <>
        <div><span>تاريخ الإصدار</span><strong>{date(doc.issue_date)}</strong></div>
        <div><span>{kind === "quote" ? "صالح حتى" : "تاريخ الاستحقاق"}</span><strong>{date(doc.due_date)}</strong></div>
      </>}
    </section>

    {kind === "receipt" && receipt ? <section className="fdoc-receipt">
      <p>استلمنا من <b>{doc.recipient ?? "ولي الأمر"}</b> مبلغ</p>
      <p className="fdoc-amount">{sar(receipt.amount)}</p>
      <p>بطريقة {paymentMethodLabels[receipt.method as PaymentMethod] ?? receipt.method}{receipt.reference ? <> (مرجع <span dir="ltr">{receipt.reference}</span>)</> : null}، عن {docLabel("invoice", doc.number)}{doc.title ? ` — ${doc.title}` : ""}.</p>
      <p className="fdoc-muted">المتبقي على الفاتورة: {sar(remaining)}</p>
    </section> : <>
      {doc.title ? <h2 className="fdoc-subject">{doc.title}</h2> : null}
      <table className="fdoc-lines">
        <thead><tr><th>البند</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>الضريبة</th><th>الصافي</th></tr></thead>
        <tbody>{lines.map((line, index) => <tr key={index}>
          <td>{line.description}<small>{feeKindLabels[line.kind] ?? ""}</small></td>
          <td>{Number(line.quantity).toLocaleString("ar-SA")}</td><td>{sar(line.unit_price)}</td>
          <td>{Number(line.discount) ? `− ${sar(line.discount)}` : "—"}</td><td>{Number(line.vat_rate).toLocaleString("ar-SA")}٪</td><td>{sar(net(line))}</td>
        </tr>)}
          {!lines.length ? <tr><td colSpan={6} className="fdoc-muted">بدون بنود تفصيلية.</td></tr> : null}
        </tbody>
      </table>
      <div className="fdoc-bottom">
        <div className="fdoc-side">
          {showBank ? <div className="fdoc-bank"><span>للتحويل البنكي</span>{profile.bank_name ? <b>{profile.bank_name}</b> : null}<b dir="ltr">{profile.iban}</b><span>باسم {profile.legal_name ?? profile.name}</span></div> : null}
          {kind === "invoice" && payments.length ? <div className="fdoc-payments"><span>المدفوعات</span>{payments.map(payment => <p key={payment.receipt_number}>إيصال {payment.receipt_number} · {date(payment.paid_on)} · {paymentMethodLabels[payment.method as PaymentMethod] ?? payment.method} · <b>{sar(payment.amount)}</b></p>)}</div> : null}
        </div>
        <dl className="fdoc-totals">
          <dt>المجموع</dt><dd>{sar(doc.subtotal)}</dd>
          {Number(doc.discount_total) ? <><dt>الخصومات</dt><dd>− {sar(doc.discount_total)}</dd></> : null}
          <dt>ضريبة القيمة المضافة</dt><dd>{sar(doc.vat_total)}</dd>
          {Number(doc.vat_relief) ? <><dt>ضريبة تتحمّلها الدولة</dt><dd>− {sar(doc.vat_relief)}</dd></> : null}
          <dt className="grand">{kind === "quote" ? "الإجمالي" : "المطلوب"}</dt><dd className="grand">{sar(doc.total)}</dd>
          {kind === "invoice" && Number(doc.paid_total) ? <><dt>المدفوع</dt><dd>{sar(doc.paid_total)}</dd><dt className="grand">المتبقي</dt><dd className="grand">{sar(remaining)}</dd></> : null}
        </dl>
      </div>
      {doc.notes ? <p className="fdoc-notes">{doc.notes}</p> : null}
      {kind === "quote" && profile.quote_terms ? <div className="fdoc-terms"><span>الشروط والأحكام</span><p>{profile.quote_terms}</p></div> : null}
    </>}
    {stamp ? <span className={`fdoc-stamp s-${doc.status}`} aria-hidden="true">{stamp}</span> : null}
    <footer className="fdoc-foot">
      {profile.invoice_footer ? <p>{profile.invoice_footer}</p> : null}
      <p className="fdoc-muted">مستند صادر عبر منصة سِير، وليس فاتورة ضريبية إلكترونية معتمدة من هيئة الزكاة والضريبة والجمارك.</p>
    </footer>
  </article>;
}
