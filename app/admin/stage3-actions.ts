"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { appBase } from "../../lib/surface";
import { isAdminRole } from "../../lib/admin-roles";
import { parseCouponForm, type BroadcastAudience } from "../../lib/admin-stage3";
import type { AdminResult } from "./actions";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const errorText = (code: string | undefined, fallback = "تعذر التنفيذ.") =>
  code === "42501" ? "هذا الإجراء خارج صلاحية دورك (أو تحتاج التحقق الثنائي)." : code === "22023" ? "تحقق من القيم المدخلة." : code === "P0002" ? "ما لقيت السجل المطلوب." : code === "23505" ? "موجود من قبل." : code === "54000" ? "انتظر دقيقة ثم حاول مرة ثانية." : fallback;

/**
 * «سِير أدمن» stage 3 actions. Every database function checks the role and two-step verification
 * again, and writes the action to platform_audit.
 */
async function call<T = unknown>(fn: string, args: Record<string, unknown>, paths: string[], messages: Partial<Record<string, string>> = {}): Promise<{ data?: T; error?: string }> {
  try {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.rpc(fn, args);
    if (error) return { error: messages[error.code ?? ""] ?? errorText(error.code) };
    paths.forEach(path => revalidatePath(path));
    return { data: data as T };
  } catch { return { error: "تعذر التنفيذ." }; }
}

// Coupons -------------------------------------------------------------------------------------------
export async function saveCoupon(data: FormData): Promise<AdminResult> {
  const parsed = parseCouponForm(data);
  if ("error" in parsed) return { error: parsed.error };
  const result = await call("admin_save_coupon", parsed.args, ["/admin/coupons"], { "23505": "هذا الكود مستخدم لكوبون ثاني." });
  return result.error ? { error: result.error } : { success: parsed.args.p_id ? "انحفظ الكوبون." : "أُضيف الكوبون." };
}

// Invoices ------------------------------------------------------------------------------------------
export async function issueInvoice(org: string, description: string, amount: number, note: string): Promise<AdminResult> {
  if (!uuid.test(org)) return { error: "طلب غير صالح." };
  if (description.trim().length < 2) return { error: "اكتب وصف الفاتورة." };
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1_000_000) return { error: "المبلغ رقم غير صفر (حتى مليون)." };
  const result = await call("admin_issue_invoice", { org, p_description: description.trim().slice(0, 300), p_amount: Math.round(amount * 100) / 100, p_note: note.trim().slice(0, 500) || null },
    ["/admin/invoices", `/admin/subscribers/${org}`]);
  return result.error ? { error: result.error } : { success: "صدرت الفاتورة ووصل المالك إشعار." };
}

// Broadcast -----------------------------------------------------------------------------------------
function audienceArgs(audience: BroadcastAudience) {
  return { p_status: audience.status, p_plan: audience.plan && uuid.test(audience.plan) ? audience.plan : null,
    p_orgs: audience.orgs.filter(id => uuid.test(id)).slice(0, 500), p_managers: audience.managers };
}
export async function previewBroadcast(audience: BroadcastAudience): Promise<{ error?: string; counts?: { organizations: number; recipients: number; emails: number } }> {
  const result = await call<{ organizations: number; recipients: number; emails: number }>("admin_broadcast_preview", audienceArgs(audience), []);
  return result.error ? { error: result.error } : { counts: result.data };
}
export async function sendBroadcast(key: string, title: string, body: string, link: string, audience: BroadcastAudience, email: boolean): Promise<AdminResult & { sent?: { notified: number; emailed: number; repeated: boolean } }> {
  if (!uuid.test(key)) return { error: "طلب غير صالح." };
  if (title.trim().length < 2 || body.trim().length < 2) return { error: "اكتب العنوان والنص." };
  const cleanLink = link.trim();
  if (cleanLink && !/^\/[A-Za-z0-9/_?=&.%-]*$/.test(cleanLink) && !/^https:\/\/\S{4,}$/.test(cleanLink)) return { error: "الرابط يبدأ بـ / (صفحة في المنصة) أو https://" };
  const result = await call<{ notified: number; emailed: number; repeated: boolean }>("admin_broadcast_send", {
    p_key: key, p_title: title.trim().slice(0, 120), p_body: body.trim().slice(0, 2000), p_link: cleanLink || null, ...audienceArgs(audience), p_email: email, p_base: appBase(),
  }, ["/admin/broadcast"]);
  if (result.error || !result.data) return { error: result.error ?? "تعذر الإرسال." };
  return { success: result.data.repeated ? "انرسلت هذي الرسالة قبل؛ ما تكررت." : "انرسلت الرسالة.", sent: result.data };
}

// Login security ------------------------------------------------------------------------------------
export async function releaseLock(id: number): Promise<AdminResult> {
  if (!Number.isInteger(id) || id < 1) return { error: "طلب غير صالح." };
  const result = await call("admin_release_lock", { p_lock: id }, ["/admin/security", "/admin"]);
  return result.error ? { error: result.error } : { success: "انفك القفل." };
}
export async function blockIp(ip: string, reason: string, days: number | null): Promise<AdminResult> {
  if (!/^[0-9a-fA-F:.]+(\/\d{1,3})?$/.test(ip.trim())) return { error: "اكتب عنوان IP صحيح (أو نطاق مثل 203.0.113.0/24)." };
  if (reason.trim().length < 3) return { error: "اكتب سبب الحظر." };
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) return { error: "مدة الحظر من ١ إلى ٣٦٥ يوم." };
  const result = await call("admin_block_ip", { p_ip: ip.trim(), p_reason: reason.trim().slice(0, 300), p_days: days }, ["/admin/security"]);
  return result.error ? { error: result.error === "تحقق من القيم المدخلة." ? "العنوان غير صحيح أو النطاق واسع جدًا." : result.error } : { success: "انحظر العنوان من تسجيل الدخول." };
}
export async function unblockIp(id: number): Promise<AdminResult> {
  if (!Number.isInteger(id) || id < 1) return { error: "طلب غير صالح." };
  const result = await call("admin_unblock_ip", { p_block: id }, ["/admin/security"]);
  return result.error ? { error: result.error } : { success: "انشال الحظر." };
}

// Team ----------------------------------------------------------------------------------------------
export async function inviteAdmin(email: string, role: string): Promise<AdminResult> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return { error: "اكتب بريدًا صحيحًا." };
  if (!isAdminRole(role)) return { error: "اختر الدور." };
  const result = await call("admin_team_invite", { p_email: email.trim(), p_role: role }, ["/admin/team"],
    { P0002: "ما فيه حساب بهذا البريد. اطلب منه يسجّل في سِير أولًا.", "23505": "هذا الحساب في الفريق من قبل." });
  return result.error ? { error: result.error } : { success: "انضاف للفريق. يطلب منه التحقق الثنائي عند أول دخول." };
}
export async function setAdminRole(user: string, role: string): Promise<AdminResult> {
  if (!uuid.test(user) || !isAdminRole(role)) return { error: "طلب غير صالح." };
  const result = await call("admin_team_set_role", { p_user: user, p_role: role }, ["/admin/team"], { "22023": "لازم يبقى مالك واحد على الأقل، وما تقدر تغيّر دورك بنفسك." });
  return result.error ? { error: result.error } : { success: "تغيّر الدور." };
}
export async function removeAdmin(user: string): Promise<AdminResult> {
  if (!uuid.test(user)) return { error: "طلب غير صالح." };
  const result = await call("admin_team_remove", { p_user: user }, ["/admin/team"], { "22023": "لازم يبقى مالك واحد على الأقل، وما تقدر تشيل نفسك." });
  return result.error ? { error: result.error } : { success: "انشال من الفريق." };
}
