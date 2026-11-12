"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { isFeature } from "../../lib/subscriptions";

export type AdminResult = { error?: string; success?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Every function below is checked again in the database (platform admins only) and audited there.
async function call(fn: string, args: Record<string, unknown>, done: string, paths: string[]): Promise<AdminResult> {
  try {
    const client = await createSupabaseServerClient();
    const { error } = await client.rpc(fn, args);
    if (error) return { error: error.code === "42501" ? "لمسؤول المنصة فقط." : error.code === "22023" ? "تحقق من القيم المدخلة." : "تعذر التنفيذ." };
    paths.forEach(path => revalidatePath(path));
    return { success: done };
  } catch { return { error: "تعذر التنفيذ." }; }
}
export async function approvePayment(id: string) {
  if (!uuid.test(id)) return { error: "طلب غير صالح." };
  return call("admin_approve_payment", { payment: id }, "اعتُمد التحويل وتفعّل الاشتراك، ووصل المشترك إشعار.", ["/admin", "/admin/payments", "/admin/subscribers"]);
}
export async function rejectPayment(id: string, reason: string) {
  if (!uuid.test(id)) return { error: "طلب غير صالح." };
  if (reason.trim().length < 3) return { error: "اكتب سبب الرفض؛ يوصل للمشترك." };
  return call("admin_reject_payment", { payment: id, reason: reason.trim() }, "رُفض التحويل ووصل السبب للمشترك.", ["/admin", "/admin/payments"]);
}
export async function extendSubscription(org: string, days: number) {
  if (!uuid.test(org) || !Number.isInteger(days) || days < 1 || days > 730) return { error: "عدد الأيام من ١ إلى ٧٣٠." };
  return call("admin_extend", { org, days }, `مُدّد الاشتراك ${days.toLocaleString("ar-SA")} يوم.`, [`/admin/subscribers/${org}`, "/admin"]);
}
/** Extends by calendar months from the later of today and the current end (e.g. pilot schools). */
export async function extendSubscriptionMonths(org: string, months: number) {
  if (!uuid.test(org) || !Number.isInteger(months) || months < 1 || months > 24) return { error: "عدد الأشهر من ١ إلى ٢٤." };
  return call("admin_extend_months", { org, months }, `مُدّد الاشتراك ${months.toLocaleString("ar-SA")} ${months === 1 ? "شهر" : months <= 10 ? "أشهر" : "شهرًا"}.`, [`/admin/subscribers/${org}`, "/admin"]);
}
export async function changePlan(org: string, plan: string) {
  if (!uuid.test(org) || !uuid.test(plan)) return { error: "طلب غير صالح." };
  return call("admin_set_plan", { org, plan }, "تغيّرت الباقة.", [`/admin/subscribers/${org}`]);
}
export async function setSuspended(org: string, suspended: boolean) {
  if (!uuid.test(org)) return { error: "طلب غير صالح." };
  return call("admin_set_suspended", { org, suspended }, suspended ? "أُوقف الاشتراك." : "أُعيد تفعيل الاشتراك.", [`/admin/subscribers/${org}`, "/admin"]);
}
export async function saveNote(org: string, note: string) {
  if (!uuid.test(org)) return { error: "طلب غير صالح." };
  return call("admin_set_note", { org, note: note.slice(0, 2000) }, "انحفظت الملاحظة.", [`/admin/subscribers/${org}`]);
}
export async function savePlan(data: FormData): Promise<AdminResult> {
  const id = String(data.get("id") ?? "");
  const features = data.getAll("features").map(String).filter(isFeature);
  const price = Number(data.get("monthly_price"));
  const name = String(data.get("name") ?? "").trim();
  const key = String(data.get("key") ?? "").trim().toLowerCase();
  if (!name || !Number.isFinite(price) || price < 0 || (!id && !/^[a-z][a-z0-9_]{1,30}$/.test(key))) return { error: "اكتب الاسم والسعر، ومفتاحًا إنجليزيًا للباقة الجديدة." };
  return call("admin_save_plan", { plan: id || null, key: key || "x", name, description: String(data.get("description") ?? "").trim() || null, features, monthly_price: price,
    sort_order: Number(data.get("sort_order") ?? 0) || 0, is_active: data.get("is_active") === "on" }, id ? "حُدّثت الباقة." : "أُضيفت الباقة.", ["/admin/plans", "/pricing"]);
}
export async function saveDuration(months: number, discount: number, active: boolean) {
  if (![1, 3, 6, 12].includes(months) || !Number.isFinite(discount) || discount < 0 || discount > 90) return { error: "الخصم من ٠ إلى ٩٠٪." };
  return call("admin_save_duration", { months, discount, active }, "حُدّث خصم المدة.", ["/admin/plans", "/pricing"]);
}
export async function saveSettings(data: FormData): Promise<AdminResult> {
  const accounts = [0, 1, 2].map(index => ({ bank: String(data.get(`bank_${index}`) ?? "").trim(), holder: String(data.get(`holder_${index}`) ?? "").trim(), iban: String(data.get(`iban_${index}`) ?? "").replace(/\s/g, "").toUpperCase() }))
    .filter(account => account.bank || account.holder || account.iban);
  if (accounts.some(account => !/^SA\d{22}$/.test(account.iban) || account.bank.length < 2 || account.holder.length < 2)) return { error: "كل حساب يحتاج اسم البنك واسم صاحب الحساب وآيبان سعودي (SA و٢٢ رقمًا)." };
  const trial = Number(data.get("trial_days")), grace = Number(data.get("grace_days"));
  if (!Number.isInteger(trial) || trial < 1 || trial > 90 || !Number.isInteger(grace) || grace < 0 || grace > 60) return { error: "مدة التجربة ١–٩٠ يوم، والمهلة ٠–٦٠ يوم." };
  return call("admin_save_settings", { bank_accounts: accounts, trial_days: trial, grace_days: grace, lock_family_links: data.get("lock_family_links") === "on" }, "حُفظت الإعدادات.", ["/admin/settings", "/pricing"]);
}
