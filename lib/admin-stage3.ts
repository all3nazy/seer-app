import { arNumber } from "./dates";
import { durationLabel } from "./subscriptions";

/** Pure helpers for «سِير أدمن» stage 3 (coupons, broadcasts, the log): shared by pages, actions and tests. */

// Coupons -------------------------------------------------------------------------------------------
export type Coupon = { id: string; code: string; kind: "percent" | "fixed"; value: number; plan_ids: string[]; months: number[]; valid_from: string | null; valid_until: string | null;
  max_uses: number | null; max_per_org: number | null; first_payment_only: boolean; note: string | null; is_active: boolean; created_at: string; used: number; pending: number; discount_total: number };

const intOrNull = (value: FormDataEntryValue | null) => { const text = String(value ?? "").trim(); if (!text) return null; const n = Number(text); return Number.isInteger(n) && n > 0 ? n : NaN; };
const dateOrNull = (value: FormDataEntryValue | null) => { const text = String(value ?? "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text ? "bad" : null; };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The coupon form → admin_save_coupon arguments, or an Arabic error. */
export function parseCouponForm(data: FormData): { error: string } | { args: Record<string, unknown> & { p_id: string | null } } {
  const id = String(data.get("id") ?? "").trim();
  const code = String(data.get("code") ?? "").trim().toUpperCase();
  const kind = String(data.get("kind") ?? "percent");
  const value = Number(String(data.get("value") ?? "").trim());
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return { error: "الكود من ٣ إلى ٣٠ حرفًا إنجليزيًا أو رقمًا (ويسمح بـ - و _)." };
  if (kind !== "percent" && kind !== "fixed") return { error: "اختر نوع الخصم." };
  if (!Number.isFinite(value) || value <= 0 || (kind === "percent" && value > 100)) return { error: kind === "percent" ? "النسبة من ١ إلى ١٠٠٪." : "اكتب مبلغ الخصم بالريال." };
  const plans = data.getAll("plans").map(String).filter(item => uuid.test(item));
  const months = data.getAll("months").map(Number).filter(item => [1, 3, 6, 12].includes(item));
  const from = dateOrNull(data.get("valid_from")), until = dateOrNull(data.get("valid_until"));
  if (from === "bad" || until === "bad") return { error: "تحقق من التواريخ." };
  if (from && until && until < from) return { error: "تاريخ النهاية قبل البداية." };
  const maxUses = intOrNull(data.get("max_uses")), maxPerOrg = intOrNull(data.get("max_per_org"));
  if (Number.isNaN(maxUses) || Number.isNaN(maxPerOrg)) return { error: "حدود الاستخدام أرقام صحيحة أكبر من صفر (أو اتركها فاضية)." };
  return { args: {
    p_id: uuid.test(id) ? id : null, p_code: code, p_kind: kind, p_value: Math.round(value * 100) / 100, p_plans: plans, p_months: months, p_from: from, p_until: until,
    p_max_uses: maxUses, p_max_per_org: maxPerOrg, p_first_only: data.get("first_payment_only") === "on", p_note: String(data.get("note") ?? "").trim().slice(0, 500) || null,
    p_active: data.get("is_active") !== "off",
  } };
}

/** «٢٠٪» or «١٠٠ ر.س». */
export const couponValue = (coupon: Pick<Coupon, "kind" | "value">) => coupon.kind === "percent" ? `${arNumber(Number(coupon.value))}٪` : `${arNumber(Number(coupon.value))} ر.س`;

/** One line about where a coupon applies: plans, durations, first payment only. */
export function couponScope(coupon: Pick<Coupon, "plan_ids" | "months" | "first_payment_only">, plans: { id: string; name: string }[]): string {
  const planText = coupon.plan_ids.length ? coupon.plan_ids.map(id => plans.find(plan => plan.id === id)?.name ?? "باقة محذوفة").join("، ") : "كل الباقات";
  const monthsText = coupon.months.length ? [...coupon.months].sort((a, b) => a - b).map(durationLabel).join("، ") : "كل المدد";
  return `${planText} · ${monthsText}${coupon.first_payment_only ? " · أول دفعة فقط" : " · كل تجديد"}`;
}

/** Whether a coupon can be used today (the database decides at payment time). */
export function couponState(coupon: Pick<Coupon, "is_active" | "valid_from" | "valid_until" | "max_uses" | "used" | "pending">, today: string): { label: string; tone: "ok" | "rose" | "sun" | "" } {
  if (!coupon.is_active) return { label: "موقوف", tone: "" };
  if (coupon.valid_until && today > coupon.valid_until) return { label: "انتهى", tone: "rose" };
  if (coupon.valid_from && today < coupon.valid_from) return { label: "يبدأ لاحقًا", tone: "sun" };
  if (coupon.max_uses !== null && coupon.used + coupon.pending >= coupon.max_uses) return { label: "اكتمل استخدامه", tone: "sun" };
  return { label: "فعّال", tone: "ok" };
}

/** Why a code did not apply, for the subscriber. */
export const couponReasons: Record<string, string> = {
  empty: "اكتب كود الخصم.", not_found: "الكود غير صحيح.", inactive: "هذا الكود موقوف.", not_started: "هذا الكود ما بدأ بعد.", expired: "انتهت صلاحية هذا الكود.",
  plan: "الكود ما ينطبق على هذه الباقة.", period: "الكود ما ينطبق على هذه المدة.", used_up: "انتهت مرات استخدام هذا الكود.", org_limit: "استخدمت منشأتك هذا الكود من قبل.",
  first_only: "هذا الكود لأول دفعة اشتراك فقط.", price: "اختر باقة ومدة متاحة.",
};
export const couponReason = (reason: string | null | undefined) => couponReasons[reason ?? ""] ?? "تعذر تطبيق الكود.";

// Broadcasts ----------------------------------------------------------------------------------------
export type BroadcastStatus = "all" | "active" | "trial" | "grace" | "locked";
export type BroadcastAudience = { status: BroadcastStatus; plan: string | null; orgs: string[]; managers: boolean };
export const broadcastStatuses: [BroadcastStatus, string][] = [["all", "كل المشتركين"], ["active", "نشط"], ["trial", "تجربة"], ["grace", "في المهلة"], ["locked", "مقفل"]];
/** «كل المشتركين · الباقة المتقدمة · مع المدراء» for the history. */
export function audienceText(audience: { status?: string; plan?: string | null; orgs?: string[] }, managers: boolean, plans: { id: string; name: string }[]): string {
  const parts = [broadcastStatuses.find(([key]) => key === (audience.status ?? "all"))?.[1] ?? "كل المشتركين"];
  if (audience.plan) parts.push(`باقة ${plans.find(plan => plan.id === audience.plan)?.name ?? "محذوفة"}`);
  if (audience.orgs?.length) parts.push(`${arNumber(audience.orgs.length)} منشأة مختارة`);
  parts.push(managers ? "الملاك والمدراء" : "الملاك");
  return parts.join(" · ");
}

// The operations log --------------------------------------------------------------------------------
export type AuditQuery = { actor: string; action: string; org: string; from: string; to: string; page: number };
export const AUDIT_PER_PAGE = 50;
export function auditQuery(params: Record<string, string | undefined>): AuditQuery {
  const date = (value?: string) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value! : "";
  return { actor: uuid.test(params.actor ?? "") ? params.actor! : "", action: /^[a-z_]{2,60}$/.test(params.action ?? "") ? params.action! : "",
    org: uuid.test(params.org ?? "") ? params.org! : "", from: date(params.from), to: date(params.to), page: Math.max(1, Math.min(10_000, Number.parseInt(params.page ?? "1", 10) || 1)) };
}
export function auditHref(query: AuditQuery, page: number, base = "/admin/audit"): string {
  const params = new URLSearchParams();
  for (const key of ["actor", "action", "org", "from", "to"] as const) if (query[key]) params.set(key, query[key]);
  if (page > 1) params.set("page", String(page));
  const text = params.toString();
  return `${base}${text ? `?${text}` : ""}`;
}
export const auditRpcArgs = (query: AuditQuery, per = AUDIT_PER_PAGE, page = query.page) => ({
  p_actor: query.actor || null, p_action: query.action || null, p_org: query.org || null, p_from: query.from || null, p_to: query.to || null, p_page: page, p_per: per,
});

/** The detail of a log entry in one short line (keys that matter, no ids). */
export function auditDetail(detail: Record<string, unknown> | null | undefined): string {
  if (!detail) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(detail)) {
    if (value === null || value === undefined || value === "" || /^(target|user|member|coupon|invoice|broadcast|block|plan|new_owner)$/.test(key)) continue;
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    parts.push(`${key}: ${text.length > 80 ? `${text.slice(0, 79)}…` : text}`);
  }
  return parts.join(" · ");
}

/** CSV with a BOM (Excel opens Arabic correctly), quoted fields, CRLF lines; formulas are neutralised. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined) => {
    let text = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return "﻿" + rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
