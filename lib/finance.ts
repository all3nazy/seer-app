import { uuid, ValidationError } from "./operations";
import { isIsoDate, riyadhToday } from "./students";
import { arNumber } from "./dates";

export const feeKinds = ["tuition", "registration", "transport", "uniform", "books", "meals", "activity", "other"] as const;
export type FeeKind = (typeof feeKinds)[number];
export const feeKindLabels: Record<FeeKind, string> = { tuition: "رسوم دراسية", registration: "رسوم تسجيل", transport: "نقل", uniform: "زي مدرسي", books: "كتب", meals: "وجبات", activity: "أنشطة", other: "أخرى" };
export const paymentMethods = ["cash", "bank_transfer", "mada", "card", "apple_pay", "google_pay", "tabby", "tamara", "cheque", "other"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
export const paymentMethodLabels: Record<PaymentMethod, string> = { cash: "نقدًا", bank_transfer: "تحويل بنكي", mada: "مدى", card: "بطاقة ائتمانية", apple_pay: "أبل باي", google_pay: "قوقل باي", tabby: "تابي", tamara: "تمارا", cheque: "شيك", other: "أخرى" };
export const discountReasons = ["sibling", "staff", "scholarship", "early_payment", "other"] as const;
export const discountReasonLabels: Record<(typeof discountReasons)[number], string> = { sibling: "خصم إخوان", staff: "أبناء الموظفين", scholarship: "منحة", early_payment: "سداد مبكر", other: "أخرى" };
export const invoiceStatusLabels: Record<string, string> = { draft: "مسودة", issued: "صادرة", paid: "مسددة", void: "ملغاة" };
export const invoiceStatusTone: Record<string, string> = { draft: "", issued: "coral", paid: "ok", void: "rose" };
export const financeTables = ["fee_items", "fee_plans", "fee_plan_items", "discounts"] as const;
export type FinanceTable = (typeof financeTables)[number];
export function isFinanceTable(value: unknown): value is FinanceTable { return typeof value === "string" && financeTables.some(table => table === value); }

export type Invoice = {
  id: string; number: number | null; title: string | null; status: string; guardian_id: string | null; child_id: string | null;
  issue_date: string | null; due_date: string | null; notes: string | null; vat_borne_by_state: boolean;
  subtotal: number; discount_total: number; vat_total: number; vat_relief: number; amount_sar: number; paid_total: number; created_at: string;
};
export type InvoiceLine = { id: string; description: string; kind: FeeKind; quantity: number; unit_price: number; discount: number; vat_rate: number; fee_item_id: string | null };
export type Payment = { id: string; invoice_id: string; receipt_number: number; amount: number; method: PaymentMethod; paid_on: string; reference: string | null; notes: string | null; recorded_at: string; recorded_by: string | null };

export function sar(value: number | string | null | undefined): string {
  return `${arNumber(Number(value ?? 0), { min: 2, max: 2 })} ر.س`;
}
export function invoiceLabel(invoice: Pick<Invoice, "number" | "title">): string {
  return invoice.number ? `فاتورة رقم ${arNumber(invoice.number, { grouping: false })}` : `مسودة${invoice.title ? `: ${invoice.title}` : ""}`;
}
export function lineNet(line: Pick<InvoiceLine, "quantity" | "unit_price" | "discount">): number {
  return Math.round(Number(line.quantity) * Number(line.unit_price) * 100) / 100 - Number(line.discount);
}
export function balance(invoice: Pick<Invoice, "amount_sar" | "paid_total">): number {
  return Math.round((Number(invoice.amount_sar) - Number(invoice.paid_total)) * 100) / 100;
}

function text(data: FormData, key: string, label: string, max: number): string {
  const value = data.get(key);
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > max) throw new ValidationError(`اكتب ${label}.`);
  return value.trim();
}
function optionalText(data: FormData, key: string, max: number): string | null {
  const value = data.get(key);
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new ValidationError(`النص لا يتجاوز ${arNumber(max)} حرف.`);
  return value.trim() || null;
}
export function money(data: FormData, key: string, label: string, allowZero = true): number {
  const raw = data.get(key);
  if (typeof raw !== "string" || !/^\d{1,10}(\.\d{1,2})?$/.test(raw.trim())) throw new ValidationError(`${label}: أدخل مبلغًا صحيحًا بمنزلتين عشريتين كحد أقصى.`);
  const value = Number(raw.trim());
  if (!allowZero && value <= 0) throw new ValidationError(`${label} لازم يكون أكبر من صفر.`);
  return value;
}
function choice<T extends string>(data: FormData, key: string, allowed: readonly T[]): T {
  const value = data.get(key);
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new ValidationError("القيمة المحددة غير صالحة.");
  return value as T;
}
function vatRate(data: FormData): number { const value = Number(data.get("vat_rate") ?? 15); if (value !== 0 && value !== 15) throw new ValidationError("الضريبة ٠٪ أو ١٥٪."); return value; }

export function financeValues(table: FinanceTable, data: FormData, editing: boolean): Record<string, string | number | boolean | null> {
  switch (table) {
    case "fee_items": return { name: text(data, "name", "اسم البند", 80), kind: choice(data, "kind", feeKinds), default_amount: money(data, "default_amount", "المبلغ"), vat_rate: vatRate(data), is_active: data.get("is_active") !== "off" };
    case "fee_plans": {
      const installments = Number(data.get("installments") ?? 1);
      if (!Number.isInteger(installments) || installments < 1 || installments > 12) throw new ValidationError("عدد الأقساط من ١ إلى ١٢.");
      const grade = data.get("grade_level_id");
      return { name: text(data, "name", "اسم الباقة", 80), grade_level_id: grade ? uuid(grade) : null, installments, notes: optionalText(data, "notes", 500) };
    }
    case "fee_plan_items": return editing ? { amount: money(data, "amount", "المبلغ") } : { fee_plan_id: uuid(data.get("fee_plan_id")), fee_item_id: uuid(data.get("fee_item_id")), amount: money(data, "amount", "المبلغ") };
    case "discounts": {
      const kind = choice(data, "kind", ["percent", "fixed"] as const);
      const value = money(data, "value", "قيمة الخصم", false);
      if (kind === "percent" && value > 100) throw new ValidationError("النسبة لا تتجاوز ١٠٠٪.");
      return { name: text(data, "name", "اسم الخصم", 80), reason: choice(data, "reason", discountReasons), kind, value, is_active: data.get("is_active") !== "off" };
    }
  }
}

export function invoiceHeader(data: FormData) {
  const due = data.get("due_date");
  if (due && !isIsoDate(due)) throw new ValidationError("أدخل تاريخ استحقاق صحيحًا.");
  const child = data.get("child_id"), guardian = data.get("guardian_id");
  return {
    title: text(data, "title", "عنوان الفاتورة", 120), child_id: child ? uuid(child) : null, guardian_id: guardian ? uuid(guardian) : null,
    due_date: typeof due === "string" && due ? due : null, notes: optionalText(data, "notes", 1000), vat_borne_by_state: data.get("vat_borne_by_state") === "on",
  };
}
export function lineValues(data: FormData) {
  const quantity = Number(data.get("quantity") ?? 1);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000 || Math.round(quantity * 100) !== quantity * 100) throw new ValidationError("الكمية من ٠٫٠١ إلى ١٠٠٠.");
  const unit = money(data, "unit_price", "السعر");
  const discount = data.get("discount") ? money(data, "discount", "الخصم") : 0;
  if (discount > Math.round(quantity * unit * 100) / 100) throw new ValidationError("الخصم أكبر من قيمة البند.");
  const item = data.get("fee_item_id");
  return { description: text(data, "description", "وصف البند", 120), kind: choice(data, "kind", feeKinds), quantity, unit_price: unit, discount, vat_rate: vatRate(data), fee_item_id: item ? uuid(item) : null };
}
export function paymentValues(data: FormData) {
  const paid = data.get("paid_on");
  if (!isIsoDate(paid) || paid > riyadhToday()) throw new ValidationError("تاريخ السداد لا يتجاوز اليوم.");
  const reference = optionalText(data, "reference", 80);
  return { amount: money(data, "amount", "المبلغ", false), method: choice(data, "method", paymentMethods), paid_on: paid, reference, notes: optionalText(data, "notes", 500) };
}
