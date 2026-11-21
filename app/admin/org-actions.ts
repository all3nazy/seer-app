"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { isFeature } from "../../lib/subscriptions";
import type { AdminResult } from "./actions";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Organization profile actions in «سِير أدمن». Each database function checks the platform admin
 * (aal2), records the action in platform_audit with the organization, and notifies the owner where
 * the subscription or the ownership changes.
 */
async function call(org: string, fn: string, args: Record<string, unknown>, done: string): Promise<AdminResult> {
  if (!uuid.test(org)) return { error: "طلب غير صالح." };
  try {
    const client = await createSupabaseServerClient();
    const { error } = await client.rpc(fn, { org, ...args });
    if (error) return { error: error.code === "42501" ? "لمسؤول المنصة بعد التحقق الثنائي فقط." : error.code === "22023" ? "تحقق من القيم المدخلة." : error.code === "P0002" ? "ما لقيت السجل المطلوب." : "تعذر التنفيذ." };
    revalidatePath(`/admin/subscribers/${org}`);
    revalidatePath("/admin");
    revalidatePath("/admin/subscribers");
    return { success: done };
  } catch { return { error: "تعذر التنفيذ." }; }
}

export async function extendOrg(org: string, amount: number, unit: "days" | "months") {
  const max = unit === "months" ? 24 : 730;
  if (!Number.isInteger(amount) || amount < 1 || amount > max) return { error: unit === "months" ? "عدد الأشهر من ١ إلى ٢٤." : "عدد الأيام من ١ إلى ٧٣٠." };
  return call(org, "admin_org_extend", { amount, unit }, "مُدّد الاشتراك ووصل المالك إشعار.");
}
export async function freeMonth(org: string) { return call(org, "admin_org_free_month", {}, "أُضيف شهر مجاني ووصل المالك إشعار."); }
export async function setOrgPlan(org: string, plan: string) {
  if (!uuid.test(plan)) return { error: "اختر باقة." };
  return call(org, "admin_org_set_plan", { plan }, "تغيّرت الباقة ووصل المالك إشعار.");
}
export async function setOrgSuspended(org: string, suspended: boolean) {
  return call(org, "admin_org_set_suspended", { suspended }, suspended ? "أُوقف الاشتراك مؤقتًا ووصل المالك إشعار." : "استؤنف الاشتراك ووصل المالك إشعار.");
}
export async function cancelOrg(org: string, reason: string) {
  if (reason.trim().length < 3) return { error: "اكتب سبب الإلغاء." };
  return call(org, "admin_org_cancel", { reason: reason.trim().slice(0, 500) }, "أُلغي الاشتراك ووصل المالك إشعار.");
}
export async function unlockLogin(org: string, member: string) {
  if (!uuid.test(member)) return { error: "طلب غير صالح." };
  return call(org, "admin_unlock_login", { member }, "انفك قفل الدخول.");
}
export async function transferOwnership(org: string, member: string) {
  if (!uuid.test(member)) return { error: "اختر العضو." };
  return call(org, "admin_transfer_ownership", { new_owner: member }, "انتقلت الملكية ووصل الطرفين إشعار.");
}
export async function setEntitlements(org: string, blocked: string[]) {
  if (!Array.isArray(blocked) || !blocked.every(isFeature)) return { error: "قسم غير معروف." };
  return call(org, "admin_set_entitlements", { blocked }, "انحفظت الأقسام المتاحة.");
}
export async function remindOnboarding(org: string) { return call(org, "admin_onboarding_remind", {}, "انرسل التذكير للمالك."); }
export async function saveOrgNote(org: string, body: string) {
  if (typeof body !== "string" || body.length > 4000) return { error: "الملاحظة طويلة جدًا." };
  return call(org, "admin_save_org_note", { body }, "انحفظت الملاحظة.");
}
