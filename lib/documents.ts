import { ValidationError } from "./operations";
import type { FeeKind } from "./finance";
import { arNumber } from "./dates";

/** The organization's identity printed on its invoices, receipts and quotes. */
export type OrgProfile = {
  name: string; legal_name: string | null; cr_number: string | null; vat_number: string | null; license_number: string | null;
  address: string | null; city: string | null; phone: string | null; email: string | null; website: string | null;
  bank_name: string | null; iban: string | null; brand_color: string; logo_data: string | null; invoice_footer: string | null; quote_terms: string | null;
};
export const emptyProfile = (name: string): OrgProfile => ({
  name, legal_name: null, cr_number: null, vat_number: null, license_number: null, address: null, city: null, phone: null, email: null,
  website: null, bank_name: null, iban: null, brand_color: "#3E1657", logo_data: null, invoice_footer: null, quote_terms: null,
});
export const profileColumns = "legal_name,cr_number,vat_number,license_number,address,city,phone,email,website,bank_name,iban,brand_color,logo_data,invoice_footer,quote_terms";

export type DocKind = "invoice" | "receipt" | "quote";
export type DocLine = { description: string; kind: FeeKind; quantity: number; unit_price: number; discount: number; vat_rate: number };
export type DocPayment = { receipt_number: number; amount: number; method: string; paid_on: string };
export type DocData = {
  number: number | null; title: string | null; status: string; issue_date: string | null; due_date: string | null; notes: string | null;
  subtotal: number; discount_total: number; vat_total: number; vat_relief: number; total: number; paid_total: number;
  child: string | null; recipient: string | null; recipient_phone?: string | null;
};
export type SharedDocument = { kind: "invoice" | "quote"; document: DocData; lines: DocLine[]; payments: DocPayment[]; organization: OrgProfile; pay?: { provider: string; mode: string; methods: import("./payments").PayMethod[] } | null };

export const quoteStatuses = ["draft", "sent", "accepted", "rejected", "invoiced"] as const;
export type QuoteStatus = (typeof quoteStatuses)[number];
export const quoteStatusLabels: Record<QuoteStatus, string> = { draft: "مسودة", sent: "مُرسل", accepted: "مقبول", rejected: "مرفوض", invoiced: "تحوّل لفاتورة" };
export const quoteStatusTone: Record<QuoteStatus, string> = { draft: "", sent: "sky", accepted: "ok", rejected: "rose", invoiced: "ok" };

const optional = (data: FormData, key: string, max: number, pattern?: RegExp, message?: string): string | null => {
  const raw = data.get(key);
  if (raw === null) return null;
  if (typeof raw !== "string") throw new ValidationError("قيمة غير صالحة.");
  const value = raw.trim();
  if (!value) return null;
  if (value.length > max) throw new ValidationError(`النص لا يتجاوز ${arNumber(max)} حرف.`);
  if (pattern && !pattern.test(value)) throw new ValidationError(message ?? "قيمة غير صالحة.");
  return value;
};
/** Arabic-Indic digits and spaces typed into number fields are normalised before checking. */
export function digits(value: string): string {
  return value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[\s-]/g, "");
}
export function profileValues(data: FormData) {
  const normalise = (key: string) => { const raw = data.get(key); if (typeof raw === "string") data.set(key, digits(raw).toUpperCase()); };
  ["cr_number", "vat_number", "iban", "phone"].forEach(normalise);
  const email = data.get("email"); if (typeof email === "string") data.set("email", email.trim().toLowerCase());
  const color = typeof data.get("brand_color") === "string" ? String(data.get("brand_color")) : "#3E1657";
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw new ValidationError("اختر لونًا صحيحًا.");
  const logo = data.get("logo_data");
  let logo_data: string | null | undefined = undefined;
  if (logo === "remove") logo_data = null;
  else if (typeof logo === "string" && logo) {
    if (logo.length > 400000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo)) throw new ValidationError("الشعار لازم يكون صورة PNG أو JPG أو WebP وحجمها صغير.");
    logo_data = logo;
  }
  return {
    legal_name: optional(data, "legal_name", 160),
    cr_number: optional(data, "cr_number", 10, /^\d{10}$/, "السجل التجاري ١٠ أرقام."),
    vat_number: optional(data, "vat_number", 15, /^3\d{13}3$/, "الرقم الضريبي ١٥ رقمًا يبدأ وينتهي بـ ٣."),
    license_number: optional(data, "license_number", 40),
    address: optional(data, "address", 300), city: optional(data, "city", 60),
    phone: optional(data, "phone", 16, /^\+?\d{8,15}$/, "رقم الهاتف غير صحيح."),
    email: optional(data, "email", 254, /^[^@\s]+@[^@\s]+\.[^@\s]+$/, "البريد غير صحيح."),
    website: optional(data, "website", 200, /^https:\/\/\S+$/, "الموقع يبدأ بـ https://"),
    bank_name: optional(data, "bank_name", 80),
    iban: optional(data, "iban", 24, /^SA\d{22}$/, "الآيبان السعودي يبدأ بـ SA ويتبعه ٢٢ رقمًا."),
    brand_color: color,
    invoice_footer: optional(data, "invoice_footer", 500), quote_terms: optional(data, "quote_terms", 1000),
    ...(logo_data !== undefined ? { logo_data } : {}),
  };
}

/**
 * Quote lines from catalogue items with an optional discount: a percentage applies to every line;
 * a fixed amount is taken from the lines in order until it is used up. Amounts are in riyals.
 */
export function quoteLines(items: { id: string; name: string; kind: FeeKind; amount: number; vat_rate: number; quantity?: number }[], discount: { kind: "percent" | "fixed"; value: number } | null) {
  let fixedLeft = discount?.kind === "fixed" ? discount.value : 0;
  return items.map((item, index) => {
    const quantity = item.quantity ?? 1;
    const gross = Math.round(quantity * item.amount * 100) / 100;
    let off = 0;
    if (discount?.kind === "percent") off = Math.round(gross * discount.value) / 100;
    else if (fixedLeft > 0) { off = Math.min(fixedLeft, gross); fixedLeft = Math.round((fixedLeft - off) * 100) / 100; }
    return { fee_item_id: item.id, description: item.name, kind: item.kind, quantity, unit_price: item.amount, discount: off, vat_rate: item.vat_rate, sort_order: index };
  });
}

export function docLabel(kind: DocKind, number: number | null): string {
  const n = number ? ` رقم ${arNumber(number, { grouping: false })}` : "";
  return kind === "quote" ? `عرض سعر${n}` : kind === "receipt" ? `إيصال استلام${n}` : `فاتورة${n}`;
}
export function shareMessage({ kind, organization, number, recipient, total, link }: { kind: "invoice" | "quote"; organization: string; number: number | null; recipient: string | null; total: string; link: string }): string {
  return [
    recipient ? `السلام عليكم ${recipient}،` : "السلام عليكم،",
    `${kind === "quote" ? "مرفق عرض السعر" : "مرفقة الفاتورة"}${number ? ` رقم ${number}` : ""} من ${organization} بمبلغ ${total}.`,
    `تقدرون تطّلعون عليها وتطبعونها من الرابط: ${link}`,
    "شاكرين لكم.",
  ].join("\n");
}
/** Readable text colour on top of the brand colour. */
export function onColor(hex: string): string {
  const value = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : "#3E1657";
  const [r, g, b] = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111111" : "#FFFFFF";
}
