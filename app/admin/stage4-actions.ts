"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { serviceClient } from "../../lib/supabase/service";
import { BACKUP_BUCKET, runBackup } from "../../lib/backup";
import type { AdminResult } from "./actions";

const errorText = (code?: string) => code === "42501" ? "هذا الإجراء للمالك فقط (مع التحقق الثنائي)." : code === "54000" ? "فيه نسخة شغالة أو أخذت نسخة قبل دقائق. انتظر شوي." : code === "P0002" ? "ما لقيت الملف المطلوب." : code === "22023" ? "تحقق من القيم." : "تعذر التنفيذ.";

/** «نسخة الحين»: the database checks the owner, the limits and logs it; the server then copies everything. */
export async function backupNow(): Promise<AdminResult> {
  const service = serviceClient();
  if (!service) return { error: "مفتاح الخدمة غير مضبوط في هذا المشروع (SUPABASE_SERVICE_ROLE_KEY)." };
  const client = await createSupabaseServerClient();
  const { data: run, error } = await client.rpc("admin_backup_authorize");
  if (error) return { error: errorText(error.code) };
  const folder = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const result = await runBackup(service, run as number, folder);
  revalidatePath("/admin/backups");
  revalidatePath("/admin/health");
  return result.ok ? { success: `انحفظت النسخة: ${result.manifest?.tables ?? 0} ملف.` } : { error: "فشلت النسخة، ووصل تنبيه تيليقرام. التفاصيل في القائمة." };
}

/** A short download link (2 minutes) for one file of a backup; checked and logged by the database first. */
export async function backupLink(run: number, file: string): Promise<AdminResult & { url?: string }> {
  if (!Number.isInteger(run) || run < 1 || !/^[a-z_0-9.]+$/.test(file)) return { error: "طلب غير صالح." };
  const service = serviceClient();
  if (!service) return { error: "مفتاح الخدمة غير مضبوط في هذا المشروع." };
  const client = await createSupabaseServerClient();
  const { data: path, error } = await client.rpc("admin_backup_download", { p_run: run, p_file: file });
  if (error || typeof path !== "string") return { error: errorText(error?.code) };
  const signed = await service.storage.from(BACKUP_BUCKET).createSignedUrl(path, 120, { download: file });
  if (signed.error || !signed.data) return { error: "تعذر تجهيز الرابط." };
  return { success: "الرابط جاهز لمدة دقيقتين.", url: signed.data.signedUrl };
}

export async function markErrorHandled(fingerprint: string, status: "resolved" | "ignored"): Promise<AdminResult> {
  if (!/^[0-9a-f]{32}$/i.test(fingerprint) || !["resolved", "ignored"].includes(status)) return { error: "طلب غير صالح." };
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("admin_error_handled", { p_fingerprint: fingerprint, p_status: status });
  if (error) return { error: errorText(error.code) };
  revalidatePath("/admin/health");
  return { success: status === "resolved" ? "تعلّم الخطأ كمحلول." : "تعلّم الخطأ كمتجاهل." };
}
