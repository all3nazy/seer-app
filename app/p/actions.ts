"use server";
import { createSupabaseServerClient } from "../../lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = /^\d{4}-\d{2}-\d{2}$/;
/** A guardian reports an absence from their portal link; the database checks the link and the child. */
export async function submitAbsenceNotice(token: string, childId: string, from: string, to: string, reason: string): Promise<{ error?: string }> {
  if (!uuid.test(token) || !uuid.test(childId) || !day.test(from) || !day.test(to)) return { error: "بيانات غير صحيحة." };
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("submit_absence_notice", { token, child: childId, from_day: from, to_day: to, note: reason.trim().slice(0, 300) || null });
  if (!error) return {};
  return { error: error.code === "22023" ? "اختر تاريخًا من اليوم إلى شهرين قادمين، ومدة لا تزيد عن ٣٠ يومًا." : error.code === "54000" ? "أرسلتم إشعارات كثيرة اليوم. تواصلوا مع المدرسة مباشرة." : "تعذر الإرسال. حاولوا مرة ثانية." };
}
