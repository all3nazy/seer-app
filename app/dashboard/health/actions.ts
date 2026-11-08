"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { uuid } from "../../../lib/operations";

export type HealthResult = { error?: string; success?: string };
export async function repairCheck(organizationId: string, checkId: string): Promise<HealthResult> {
  try {
    if (!/^[a-z_]{3,40}$/.test(checkId)) return { error: "فحص غير معروف." };
    const client = await createSupabaseServerClient();
    const { data, error } = await client.rpc("system_repair", { org: uuid(organizationId), check_id: checkId });
    if (error) return { error: error.code === "42501" ? "الإصلاح لمالك المنشأة أو مديرها." : "هذا البند يحتاج إصلاح يدوي من صفحته." };
    revalidatePath("/dashboard/health");
    const fixed = Number(data ?? 0);
    return { success: fixed ? `تم إصلاح ${fixed.toLocaleString("ar-SA")} حالة.` : "ما كان فيه شيء يحتاج إصلاح." };
  } catch { return { error: "تعذر الإصلاح الآن." }; }
}
/** Marks an error as known, resolved or ignored, and keeps the fix so it is shown if it recurs. */
export async function resolveError(fingerprint: string, status: string, resolution: string): Promise<HealthResult> {
  try {
    if (!/^[0-9a-f]{32}$/.test(fingerprint) || !["known", "resolved", "ignored", "new"].includes(status)) return { error: "طلب غير صالح." };
    const client = await createSupabaseServerClient();
    const { data, error } = await client.from("system_errors").update({ status, resolution: resolution.trim().slice(0, 1000) || null }).eq("fingerprint", fingerprint).select("fingerprint");
    if (error || !data?.length) return { error: "ما تقدر تعدّل هذا الخطأ." };
    revalidatePath("/dashboard/health");
    return { success: status === "resolved" ? "انحفظ الحل. إذا رجع الخطأ ينفتح من جديد ويظهر الحل." : status === "known" ? "انحفظ كخطأ معروف، ويظهر الحل للمستخدم إذا صار." : "تم." };
  } catch { return { error: "تعذر الحفظ." }; }
}
