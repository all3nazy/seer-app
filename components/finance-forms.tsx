"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addInvoiceLine, deleteDraftInvoice, deleteFinanceRecord, deleteInvoiceLine, deletePayment, generateInvoices,
  recordPayment, saveFinanceRecord, saveInvoice, setInvoiceStatus, type FinanceResult,
} from "../app/dashboard/finance/actions";
import { discountReasonLabels, discountReasons, feeKindLabels, feeKinds, paymentMethodLabels, paymentMethods, type FinanceTable, type Invoice } from "../lib/finance";
import { riyadhToday } from "../lib/students";
import type { RecordOption } from "../lib/operations";
import { notify } from "./feedback";

type Values = Record<string, string | number | boolean | null | undefined>;
const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));
function useToast(state: FinanceResult, after?: () => void) {
  useEffect(() => { if (state.success) { notify(state.success); after?.(); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
}
const FormError = ({ state }: { state: FinanceResult }) => state.error ? <p role="alert" className="form-error" style={{ gridColumn: "1/-1" }}>{state.error}</p> : null;
function Select({ name, label, options, value, required, empty = "غير محدد" }: { name: string; label: string; options: RecordOption[]; value?: unknown; required?: boolean; empty?: string }) {
  return <label>{label}<select name={name} defaultValue={str(value)} required={required}><option value="">{required ? "اختر" : empty}</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>;
}
const VatSelect = ({ value }: { value?: unknown }) => <label>الضريبة<select name="vat_rate" defaultValue={str(value) || "15"}><option value="15">١٥٪</option><option value="0">٠٪</option></select></label>;
const KindSelect = ({ value }: { value?: unknown }) => <label>النوع<select name="kind" defaultValue={str(value) || "tuition"}>{feeKinds.map(kind => <option key={kind} value={kind}>{feeKindLabels[kind]}</option>)}</select></label>;
const Active = ({ value }: { value?: unknown }) => <label>الحالة<select name="is_active" defaultValue={value === false ? "off" : "on"}><option value="on">فعّال</option><option value="off">معطّل</option></select></label>;

function RecordFields({ table, record, options }: { table: FinanceTable; record?: Values; options: { grades?: RecordOption[]; items?: RecordOption[]; plans?: RecordOption[] } }) {
  switch (table) {
    case "fee_items": return <><label>اسم البند<input name="name" required maxLength={80} defaultValue={str(record?.name)} /></label><KindSelect value={record?.kind} />
      <label>المبلغ الافتراضي<input name="default_amount" inputMode="decimal" required defaultValue={str(record?.default_amount) || "0"} dir="ltr" /></label><VatSelect value={record?.vat_rate} /><Active value={record?.is_active} /></>;
    case "fee_plans": return <><label>اسم الباقة<input name="name" required maxLength={80} placeholder="مثال: باقة الروضة السنوية" defaultValue={str(record?.name)} /></label>
      <Select name="grade_level_id" label="الصف" options={options.grades ?? []} value={record?.grade_level_id} empty="كل الصفوف" />
      <label>عدد الأقساط<input type="number" name="installments" min={1} max={12} required defaultValue={str(record?.installments) || "1"} /></label>
      <label>ملاحظات<input name="notes" maxLength={500} defaultValue={str(record?.notes)} /></label></>;
    case "fee_plan_items": return <>{record ? null : <><Select name="fee_plan_id" label="الباقة" options={options.plans ?? []} required /><Select name="fee_item_id" label="البند" options={options.items ?? []} required /></>}
      <label>المبلغ السنوي في الباقة<input name="amount" inputMode="decimal" required defaultValue={str(record?.amount)} dir="ltr" /></label></>;
    case "discounts": return <><label>اسم الخصم<input name="name" required maxLength={80} defaultValue={str(record?.name)} /></label>
      <label>السبب<select name="reason" defaultValue={str(record?.reason) || "sibling"}>{discountReasons.map(reason => <option key={reason} value={reason}>{discountReasonLabels[reason]}</option>)}</select></label>
      <label>النوع<select name="kind" defaultValue={str(record?.kind) || "percent"}><option value="percent">نسبة ٪</option><option value="fixed">مبلغ ثابت</option></select></label>
      <label>القيمة<input name="value" inputMode="decimal" required defaultValue={str(record?.value)} dir="ltr" /></label><Active value={record?.is_active} /></>;
  }
}
export function FinanceRecordForm({ organizationId, table, record, options = {}, onDone }: { organizationId: string; table: FinanceTable; record?: Values & { id: string }; options?: { grades?: RecordOption[]; items?: RecordOption[]; plans?: RecordOption[] }; onDone?: () => void }) {
  const [state, action, pending] = useActionState(saveFinanceRecord, {});
  useToast(state, onDone);
  return <form action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="table" value={table} /><input type="hidden" name="record_id" value={record?.id ?? ""} />
    <RecordFields table={table} record={record} options={options} />
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ الحفظ…" : record ? "حفظ" : "إضافة"}</button>
    <FormError state={state} />
  </form>;
}
export function FinanceRow({ organizationId, table, record, options, children }: { organizationId: string; table: FinanceTable; record: Values & { id: string }; options?: { grades?: RecordOption[] }; children: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  return <li style={{ display: "grid", gap: 10 }}>
    <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>{children}</div>
      <span style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-sm" onClick={() => setEditing(value => !value)} aria-expanded={editing}>{editing ? "إغلاق" : "تعديل"}</button>
        <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={() => { if (window.confirm("حذف؟")) start(async () => { const result = await deleteFinanceRecord(organizationId, table, record.id); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info"); }); }}>حذف</button>
      </span>
    </div>
    {editing ? <FinanceRecordForm organizationId={organizationId} table={table} record={record} options={options} onDone={() => setEditing(false)} /> : null}
  </li>;
}

export function InvoiceHeaderForm({ organizationId, invoice, childrenOptions, guardians }: { organizationId: string; invoice?: Invoice; childrenOptions: RecordOption[]; guardians: RecordOption[] }) {
  const [state, action, pending] = useActionState(saveInvoice, {});
  const router = useRouter();
  useToast(state);
  useEffect(() => { if (!invoice && state.id) router.push(`/dashboard/finance/invoices/${state.id}?org=${encodeURIComponent(organizationId)}`); }, [state, invoice, organizationId, router]);
  return <form action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="invoice_id" value={invoice?.id ?? ""} />
    <label>العنوان<input name="title" required maxLength={120} placeholder="مثال: رسوم الفصل الأول" defaultValue={invoice?.title ?? ""} /></label>
    <Select name="child_id" label="الطالب" options={childrenOptions} value={invoice?.child_id} />
    <Select name="guardian_id" label="ولي الأمر (المدفوع منه)" options={guardians} value={invoice?.guardian_id} />
    <label>تاريخ الاستحقاق<input type="date" name="due_date" defaultValue={invoice?.due_date ?? ""} /></label>
    <label style={{ gridColumn: "1/-1" }}>ملاحظات تظهر في الفاتورة<input name="notes" maxLength={1000} defaultValue={invoice?.notes ?? ""} /></label>
    <label style={{ gridColumn: "1/-1", display: "flex", gap: 10, alignItems: "flex-start", fontWeight: 400 }}><input type="checkbox" name="vat_borne_by_state" defaultChecked={invoice?.vat_borne_by_state ?? false} style={{ width: 20, minHeight: 20, marginTop: 3 }} />
      <span>الطالب سعودي، والدولة تتحمّل ضريبة الرسوم الدراسية عنه. <span className="hint">تظهر الضريبة في الفاتورة ولا تُحسب على ولي الأمر. تأكد من إدخال رقم هوية الطالب في ملفه.</span></span></label>
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ الحفظ…" : invoice ? "حفظ" : "إنشاء المسودة"}</button>
    <FormError state={state} />
  </form>;
}

export function InvoiceLineForm({ organizationId, invoiceId, items }: { organizationId: string; invoiceId: string; items: { id: string; name: string; kind: string; default_amount: number; vat_rate: number }[] }) {
  const [state, action, pending] = useActionState(addInvoiceLine, {});
  const [preset, setPreset] = useState<string>("");
  const item = items.find(entry => entry.id === preset);
  useToast(state);
  return <form action={action} className="composer" key={`${preset}:${state.success ?? ""}`}>
    <input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="invoice_id" value={invoiceId} />
    {items.length ? <label>من البنود<select name="fee_item_id" value={preset} onChange={event => setPreset(event.target.value)}><option value="">بند حر</option>{items.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label> : null}
    <label>الوصف<input name="description" required maxLength={120} defaultValue={item?.name ?? ""} /></label>
    <KindSelect value={item?.kind} />
    <label>الكمية<input name="quantity" inputMode="decimal" defaultValue="1" dir="ltr" /></label>
    <label>السعر<input name="unit_price" inputMode="decimal" required defaultValue={item ? String(item.default_amount) : ""} dir="ltr" /></label>
    <label>الخصم<input name="discount" inputMode="decimal" defaultValue="0" dir="ltr" /></label>
    <VatSelect value={item?.vat_rate} />
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "…" : "إضافة البند"}</button>
    <FormError state={state} />
  </form>;
}
export function DeleteLineButton({ organizationId, invoiceId, lineId }: { organizationId: string; invoiceId: string; lineId: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={() => start(async () => { const result = await deleteInvoiceLine(organizationId, invoiceId, lineId); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info"); })}>حذف</button>;
}
export function InvoiceActions({ organizationId, invoice }: { organizationId: string; invoice: Invoice }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (label: string, task: () => Promise<FinanceResult>, after?: () => void) => {
    if (!window.confirm(label)) return;
    start(async () => { const result = await task(); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info", result.error ? undefined : "done"); if (!result.error) after?.(); });
  };
  const org = encodeURIComponent(organizationId);
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    {invoice.status === "draft" ? <>
      <button type="button" className="btn-primary" disabled={pending} onClick={() => run("إصدار الفاتورة؟ بعد الإصدار ما تتعدّل بنودها.", () => setInvoiceStatus(organizationId, invoice.id, "issued"))}>إصدار الفاتورة</button>
      <button type="button" className="btn btn-danger" disabled={pending} onClick={() => run("حذف المسودة؟", () => deleteDraftInvoice(organizationId, invoice.id), () => router.push(`/dashboard/finance?org=${org}`))}>حذف المسودة</button>
    </> : null}
    {invoice.status === "issued" && Number(invoice.paid_total) === 0 ? <button type="button" className="btn btn-danger" disabled={pending} onClick={() => run("إلغاء الفاتورة؟ يبقى رقمها محفوظًا في السجل.", () => setInvoiceStatus(organizationId, invoice.id, "void"))}>إلغاء الفاتورة</button> : null}
    {invoice.number ? <a className="btn" href={`/dashboard/finance/invoices/${invoice.id}/print?org=${org}`} target="_blank" rel="noreferrer">طباعة</a> : null}
  </div>;
}

export function PaymentForm({ organizationId, invoiceId, balance }: { organizationId: string; invoiceId: string; balance: number }) {
  const [state, action, pending] = useActionState(recordPayment, {});
  useToast(state);
  return <form action={action} className="composer" key={state.success ?? ""}>
    <input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="invoice_id" value={invoiceId} />
    <label>المبلغ<input name="amount" inputMode="decimal" required defaultValue={balance.toFixed(2)} dir="ltr" /></label>
    <label>طريقة الدفع<select name="method" defaultValue="mada">{paymentMethods.map(method => <option key={method} value={method}>{paymentMethodLabels[method]}</option>)}</select></label>
    <label>تاريخ السداد<input type="date" name="paid_on" required max={riyadhToday()} defaultValue={riyadhToday()} /></label>
    <label>رقم مرجعي<input name="reference" maxLength={80} placeholder="رقم العملية أو الحوالة" dir="ltr" /></label>
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ التسجيل…" : "تسجيل الدفعة"}</button>
    <FormError state={state} />
  </form>;
}
export function DeletePaymentButton({ organizationId, invoiceId, paymentId }: { organizationId: string; invoiceId: string; paymentId: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={() => { if (window.confirm("حذف الدفعة؟ استخدمه لتصحيح خطأ إدخال فقط.")) start(async () => { const result = await deletePayment(organizationId, invoiceId, paymentId); notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info"); }); }}>حذف</button>;
}

export function GenerateInvoicesForm({ organizationId, plans, targets, discounts }: { organizationId: string; plans: RecordOption[]; targets: RecordOption[]; discounts: RecordOption[] }) {
  const [state, action, pending] = useActionState(generateInvoices, {});
  useToast(state);
  return <form action={action} className="composer" onSubmit={event => { if (!window.confirm("إنشاء فواتير الباقة لكل طلاب الاختيار؟")) event.preventDefault(); }}>
    <input type="hidden" name="organization_id" value={organizationId} />
    <Select name="fee_plan_id" label="الباقة" options={plans} required />
    <Select name="target" label="الصف أو الشعبة" options={targets} required />
    <label>أول استحقاق<input type="date" name="first_due" required /></label>
    <label>كل كم شهر قسط<input type="number" name="interval_months" min={1} max={6} defaultValue={1} /></label>
    <Select name="discount_id" label="خصم (اختياري)" options={discounts} empty="بدون خصم" />
    <label style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="checkbox" name="issue" style={{ width: 20, minHeight: 20 }} />إصدارها مباشرة (بدل مسودات)</label>
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ الإنشاء…" : "إنشاء الفواتير"}</button>
    <FormError state={state} />
  </form>;
}
