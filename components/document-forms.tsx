"use client";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addQuoteLine, convertQuote, createQuote, deleteQuote, deleteQuoteLine, renewShareLink, saveProfile, setQuoteStatus, type DocResult } from "../app/dashboard/finance/documents-actions";
import { quoteLines, type OrgProfile, type QuoteStatus } from "../lib/documents";
import { feeKindLabels, feeKinds, sar, type FeeKind } from "../lib/finance";
import { whatsappLink } from "../lib/share";
import { notify } from "./feedback";
import { FinanceDocument } from "./finance-document";

function useToast(state: DocResult) {
  useEffect(() => { if (state.success) notify(state.success, "info", "done"); else if (state.error) notify(state.error, "error"); }, [state]);
}
const FormError = ({ state }: { state: DocResult }) => state.error ? <p role="alert" className="form-error" style={{ gridColumn: "1/-1" }}>{state.error}</p> : null;

/** Shrinks an uploaded logo to at most 360px on its long side and encodes it as WebP/PNG. */
async function shrinkLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("ارفع صورة PNG أو JPG أو WebP.");
  if (file.size > 5_000_000) throw new Error("الصورة أكبر من ٥ ميجا.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 360 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let url = canvas.toDataURL("image/webp", 0.9);
  if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/png");
  if (url.length > 400000) throw new Error("الشعار كبير بعد التصغير. جرّب صورة أبسط.");
  return url;
}

export function BrandingForm({ organizationId, profile, onPreview }: { organizationId: string; profile: OrgProfile; onPreview?: (profile: OrgProfile) => void }) {
  const [state, action, pending] = useActionState(saveProfile, {});
  const [draft, setDraft] = useState<OrgProfile>(profile);
  const [logo, setLogo] = useState<string>("");
  useToast(state);
  useEffect(() => { onPreview?.(draft); }, [draft, onPreview]);
  const field = (key: keyof OrgProfile) => ({
    name: key, defaultValue: (profile[key] as string | null) ?? "",
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(current => ({ ...current, [key]: event.target.value || null })),
  });
  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try { const url = await shrinkLogo(file); setLogo(url); setDraft(current => ({ ...current, logo_data: url })); }
    catch (error) { notify(error instanceof Error ? error.message : "تعذر قراءة الصورة.", "error"); event.target.value = ""; }
  }
  return <form action={action} className="brand-form">
    <input type="hidden" name="organization_id" value={organizationId} />
    <input type="hidden" name="logo_data" value={logo} />
    <fieldset><legend>الشعار واللون</legend>
      <div className="brand-logo-row">
        {draft.logo_data ? <img src={draft.logo_data} alt="الشعار الحالي" /> : <span className="brand-logo-empty">بدون شعار</span>}
        <label className="btn btn-sm">رفع شعار<input type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} style={{ display: "none" }} /></label>
        {draft.logo_data ? <button type="button" className="btn btn-sm" onClick={() => { setLogo("remove"); setDraft(current => ({ ...current, logo_data: null })); }}>إزالة</button> : null}
      </div>
      <label>لون الهوية<span className="brand-color"><input type="color" name="brand_color" defaultValue={profile.brand_color} onChange={event => setDraft(current => ({ ...current, brand_color: event.target.value }))} /><span dir="ltr">{draft.brand_color}</span></span></label>
    </fieldset>
    <fieldset><legend>بيانات المنشأة</legend>
      <label>الاسم الرسمي (كما في السجل)<input {...field("legal_name")} maxLength={160} placeholder={profile.name} /></label>
      <label>السجل التجاري<input {...field("cr_number")} inputMode="numeric" dir="ltr" placeholder="1010XXXXXX" /></label>
      <label>الرقم الضريبي<input {...field("vat_number")} inputMode="numeric" dir="ltr" placeholder="3XXXXXXXXXXXXX3" /></label>
      <label>رقم الترخيص<input {...field("license_number")} maxLength={40} dir="auto" /></label>
      <label>العنوان<input {...field("address")} maxLength={300} placeholder="الحي، الشارع" /></label>
      <label>المدينة<input {...field("city")} maxLength={60} /></label>
      <label>الهاتف<input {...field("phone")} inputMode="tel" dir="ltr" /></label>
      <label>البريد<input {...field("email")} type="email" dir="ltr" /></label>
      <label>الموقع<input {...field("website")} dir="ltr" placeholder="https://" /></label>
    </fieldset>
    <fieldset><legend>الحساب البنكي (يظهر للتحويل)</legend>
      <label>البنك<input {...field("bank_name")} maxLength={80} /></label>
      <label>الآيبان<input {...field("iban")} dir="ltr" placeholder="SA00 0000 0000 0000 0000 0000" /></label>
    </fieldset>
    <fieldset><legend>نصوص المستندات</legend>
      <label>تذييل الفواتير<textarea {...field("invoice_footer")} maxLength={500} rows={2} placeholder="مثال: شكرًا لثقتكم. الرسوم غير مستردة بعد بداية الفصل." /></label>
      <label>شروط عروض الأسعار<textarea {...field("quote_terms")} maxLength={1000} rows={3} placeholder="مثال: العرض صالح ١٤ يومًا. يُثبت المقعد بعد سداد رسوم التسجيل." /></label>
    </fieldset>
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ الهوية"}</button>
    <FormError state={state} />
  </form>;
}

type Item = { id: string; name: string; kind: FeeKind; default_amount: number; vat_rate: number };
type Option = { id: string; name: string };
export function QuoteForm({ organizationId, items, discounts, guardians, students, defaultValid }: { organizationId: string; items: Item[]; discounts: (Option & { kind: "percent" | "fixed"; value: number })[]; guardians: Option[]; students: Option[]; defaultValid: string }) {
  const [state, action, pending] = useActionState(createQuote, {});
  const [chosen, setChosen] = useState<Record<string, { amount: number; qty: number }>>({});
  const [discountId, setDiscountId] = useState("");
  const [relief, setRelief] = useState(false);
  const [guardian, setGuardian] = useState("");
  useToast(state);
  const lines = useMemo(() => {
    const discount = discounts.find(row => row.id === discountId) ?? null;
    return quoteLines(items.filter(item => chosen[item.id]).map(item => ({ id: item.id, name: item.name, kind: item.kind, amount: chosen[item.id].amount, vat_rate: Number(item.vat_rate), quantity: chosen[item.id].qty })), discount ? { kind: discount.kind, value: Number(discount.value) } : null);
  }, [chosen, discountId, discounts, items]);
  const totals = lines.reduce((sum, line) => {
    const net = Math.round(line.quantity * line.unit_price * 100) / 100 - line.discount;
    const vat = Math.round(net * line.vat_rate) / 100;
    return { gross: sum.gross + net + line.discount, discount: sum.discount + line.discount, vat: sum.vat + vat, relief: sum.relief + (relief && line.kind === "tuition" ? vat : 0) };
  }, { gross: 0, discount: 0, vat: 0, relief: 0 });
  return <form action={action} className="composer quote-form">
    <input type="hidden" name="organization_id" value={organizationId} />
    <label style={{ gridColumn: "1/-1" }}>عنوان العرض<input name="title" required maxLength={120} placeholder="مثال: رسوم الفصل الأول ١٤٤٨" /></label>
    <label>ولي الأمر<select name="guardian_id" value={guardian} onChange={event => setGuardian(event.target.value)}><option value="">عميل جديد (اكتب الاسم)</option>{guardians.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    <label>الطالب<select name="child_id" defaultValue=""><option value="">بدون</option>{students.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    {!guardian ? <><label>اسم المستلم<input name="recipient_name" maxLength={120} placeholder="اسم ولي الأمر المحتمل" /></label>
      <label>جواله<input name="recipient_phone" inputMode="tel" dir="ltr" placeholder="05XXXXXXXX" /></label></> : null}
    <label>صالح حتى<input type="date" name="valid_until" defaultValue={defaultValid} /></label>
    <label>الخصم<select name="discount_id" value={discountId} onChange={event => setDiscountId(event.target.value)}><option value="">بدون خصم</option>{discounts.map(row => <option key={row.id} value={row.id}>{row.name} ({row.kind === "percent" ? `${row.value}٪` : sar(row.value)})</option>)}</select></label>
    <fieldset className="quote-items" style={{ gridColumn: "1/-1" }}><legend>البنود من كتالوج الرسوم</legend>
      {items.length ? items.map(item => {
        const on = Boolean(chosen[item.id]);
        return <div key={item.id} className={`quote-item${on ? " on" : ""}`}>
          <label className="quote-check"><input type="checkbox" name="item" value={item.id} checked={on} onChange={event => setChosen(current => { const next = { ...current }; if (event.target.checked) next[item.id] = { amount: Number(item.default_amount), qty: 1 }; else delete next[item.id]; return next; })} />
            <span><strong>{item.name}</strong><small>{feeKindLabels[item.kind]} · ضريبة {Number(item.vat_rate)}٪</small></span></label>
          {on ? <span className="quote-amounts">
            <label>المبلغ<input name={`amount:${item.id}`} inputMode="decimal" dir="ltr" value={chosen[item.id].amount} onChange={event => setChosen(current => ({ ...current, [item.id]: { ...current[item.id], amount: Number(event.target.value) || 0 } }))} /></label>
            <label>الكمية<input name={`qty:${item.id}`} type="number" min={1} max={1000} value={chosen[item.id].qty} onChange={event => setChosen(current => ({ ...current, [item.id]: { ...current[item.id], qty: Number(event.target.value) || 1 } }))} /></label>
          </span> : <span className="hint">{sar(item.default_amount)}</span>}
        </div>;
      }) : <p className="hint">أضف بنود الرسوم أولًا من تبويب «الرسوم والباقات».</p>}
    </fieldset>
    <label className="quote-check" style={{ gridColumn: "1/-1" }}><input type="checkbox" name="vat_borne_by_state" checked={relief} onChange={event => setRelief(event.target.checked)} /> ضريبة الرسوم الدراسية تتحمّلها الدولة (طالب سعودي)</label>
    <label style={{ gridColumn: "1/-1" }}>ملاحظات تظهر في العرض<textarea name="notes" maxLength={1000} rows={2} /></label>
    <div className="quote-summary" style={{ gridColumn: "1/-1" }} aria-live="polite">
      <span>المجموع {sar(totals.gross)}</span>{totals.discount ? <span>الخصم − {sar(totals.discount)}</span> : null}<span>الضريبة {sar(totals.vat)}</span>
      {totals.relief ? <span>تتحمّلها الدولة − {sar(totals.relief)}</span> : null}<strong>الإجمالي {sar(totals.gross - totals.discount + totals.vat - totals.relief)}</strong>
    </div>
    <button type="submit" className="btn-primary" disabled={pending || !lines.length}>{pending ? "جارٍ الإنشاء…" : "إنشاء العرض"}</button>
    <FormError state={state} />
  </form>;
}

export function QuoteLineForm({ organizationId, quoteId }: { organizationId: string; quoteId: string }) {
  const [state, action, pending] = useActionState(addQuoteLine, {});
  useToast(state);
  return <form action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="quote_id" value={quoteId} />
    <label>الوصف<input name="description" required maxLength={120} /></label>
    <label>النوع<select name="kind" defaultValue="other">{feeKinds.map(kind => <option key={kind} value={kind}>{feeKindLabels[kind]}</option>)}</select></label>
    <label>الكمية<input name="quantity" type="number" min={0.01} step={0.01} defaultValue={1} /></label>
    <label>السعر<input name="unit_price" inputMode="decimal" dir="ltr" required /></label>
    <label>الخصم<input name="discount" inputMode="decimal" dir="ltr" defaultValue="0" /></label>
    <label>الضريبة<select name="vat_rate" defaultValue="15"><option value="15">١٥٪</option><option value="0">٠٪</option></select></label>
    <button type="submit" className="btn" disabled={pending}>إضافة بند</button>
    <FormError state={state} />
  </form>;
}

export function QuoteActions({ organizationId, quoteId, status, canConvert }: { organizationId: string; quoteId: string; status: QuoteStatus; canConvert: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (work: () => Promise<DocResult & { invoiceId?: string }>) => start(async () => {
    const result = await work();
    notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info", result.error ? undefined : "done");
    if (result.invoiceId) router.push(`/dashboard/finance/invoices/${result.invoiceId}?org=${encodeURIComponent(organizationId)}`);
    else router.refresh();
  });
  return <div className="doc-actions">
    {status === "draft" ? <>
      <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => setQuoteStatus(organizationId, quoteId, "sent"))}>اعتماد وإرسال</button>
      <button type="button" className="btn btn-danger" disabled={pending} onClick={() => { if (window.confirm("حذف المسودة؟")) run(() => deleteQuote(organizationId, quoteId)); }}>حذف المسودة</button>
    </> : null}
    {status === "sent" ? <>
      <button type="button" className="btn" disabled={pending} onClick={() => run(() => setQuoteStatus(organizationId, quoteId, "accepted"))}>قبِل العميل</button>
      <button type="button" className="btn" disabled={pending} onClick={() => run(() => setQuoteStatus(organizationId, quoteId, "rejected"))}>رفض</button>
      <button type="button" className="btn" disabled={pending} onClick={() => run(() => setQuoteStatus(organizationId, quoteId, "draft"))}>رجوع للتعديل</button>
    </> : null}
    {(status === "sent" || status === "accepted") ? <>
      <button type="button" className="btn-primary" disabled={pending || !canConvert} title={canConvert ? undefined : "اربط العرض بولي أمر أو طالب"} onClick={() => run(() => convertQuote(organizationId, quoteId, true))}>تحويل لفاتورة صادرة</button>
      <button type="button" className="btn" disabled={pending || !canConvert} onClick={() => run(() => convertQuote(organizationId, quoteId, false))}>تحويل لفاتورة مسودة</button>
    </> : null}
  </div>;
}
export function DeleteQuoteLineButton({ organizationId, quoteId, lineId }: { organizationId: string; quoteId: string; lineId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={() => start(async () => { const result = await deleteQuoteLine(organizationId, quoteId, lineId); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info"); router.refresh(); })}>حذف</button>;
}

/** WhatsApp, copy and renew for a document's private link. */
export function ShareDocument({ organizationId, kind, id, link, phone, message }: { organizationId: string; kind: "invoice" | "quote"; id: string; link: string; phone: string | null; message: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  async function copy() {
    try { await navigator.clipboard.writeText(link); notify("نُسخ الرابط.", "info", "done"); } catch { notify("ما قدرت أنسخ؛ انسخ الرابط يدويًا.", "error"); }
  }
  return <div className="share-doc">
    <a className="btn-primary share-wa" href={whatsappLink(phone, message)} target="_blank" rel="noopener noreferrer">مشاركة واتساب</a>
    <button type="button" className="btn" onClick={copy}>نسخ الرابط</button>
    <a className="btn" href={link} target="_blank" rel="noopener noreferrer">معاينة كما يراها ولي الأمر</a>
    <button type="button" className="btn btn-sm" disabled={pending} onClick={() => { if (window.confirm("تجديد الرابط يوقف الرابط القديم. متأكد؟")) start(async () => { const result = await renewShareLink(organizationId, kind, id); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info"); router.refresh(); }); }}>تجديد الرابط</button>
  </div>;
}

/** The branding form beside a live sample invoice, so changes show before saving. */
export function BrandingStudio({ organizationId, profile }: { organizationId: string; profile: OrgProfile }) {
  const [preview, setPreview] = useState<OrgProfile>(profile);
  return <div className="brand-studio">
    <section className="card"><BrandingForm organizationId={organizationId} profile={profile} onPreview={setPreview} /></section>
    <section className="brand-preview" aria-label="معاينة الفاتورة">
      <FinanceDocument kind="invoice" profile={preview} lines={sampleLines} payments={[{ receipt_number: 12, amount: 2000, method: "mada", paid_on: "2026-09-01" }]}
        doc={{ number: 1024, title: "رسوم الفصل الدراسي الأول", status: "issued", issue_date: "2026-08-25", due_date: "2026-09-15", notes: null, subtotal: 5400, discount_total: 540, vat_total: 729, vat_relief: 0, total: 5589, paid_total: 2000, child: "ريم خالد", recipient: "خالد السبيعي" }} />
    </section>
  </div>;
}
const sampleLines = [
  { description: "الرسوم الدراسية", kind: "tuition" as const, quantity: 1, unit_price: 4500, discount: 450, vat_rate: 15 },
  { description: "الوجبات", kind: "meals" as const, quantity: 1, unit_price: 900, discount: 90, vat_rate: 15 },
];
