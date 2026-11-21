import { arNumber } from "./dates";

/** Pure helpers for «سِير أدمن» stage 4 (backups, health, read-only view). */
export function formatBytes(bytes: number | null | undefined): string {
  const n = Number(bytes ?? 0);
  if (n < 1024) return `${arNumber(n)} بايت`;
  if (n < 1024 * 1024) return `${arNumber(Math.round(n / 102.4) / 10)} ك.ب`;
  if (n < 1024 ** 3) return `${arNumber(Math.round(n / (1024 * 102.4)) / 10)} م.ب`;
  return `${arNumber(Math.round(n / (1024 ** 2 * 102.4)) / 10)} ج.ب`;
}
export function formatDuration(ms: number | null | undefined): string {
  const n = Number(ms ?? 0);
  if (n < 1000) return `${arNumber(n)} ملّي ث`;
  const s = Math.round(n / 1000);
  return s < 60 ? `${arNumber(s)} ث` : `${arNumber(Math.floor(s / 60))} د ${arNumber(s % 60)} ث`;
}
/** How long the oldest item has waited: «٥ دقائق», «٣ ساعات», «يومين». */
export function waitText(oldest: string | null, now: number = Date.now()): string {
  if (!oldest) return "—";
  const minutes = Math.max(0, Math.round((now - Date.parse(oldest)) / 60000));
  if (minutes < 60) return `${arNumber(minutes)} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${arNumber(hours)} ساعة`;
  return `${arNumber(Math.round(hours / 24))} يوم`;
}
export const queueLabels: Record<string, string> = { email: "البريد", messages: "رسائل واتساب/SMS", telegram: "تيليقرام", push: "الإشعارات الفورية" };
/** A queue is late when its oldest waiting item is older than this. */
export const queueLateMinutes: Record<string, number> = { email: 60, messages: 30, telegram: 10, push: 10 };
export function queueState(queue: { key: string; waiting: number; failed: number; oldest: string | null }, now: number = Date.now()): "" | "warn" | "bad" {
  if (queue.oldest && now - Date.parse(queue.oldest) > (queueLateMinutes[queue.key] ?? 60) * 60000) return "bad";
  return queue.failed ? "warn" : "";
}
export const cronNames: Record<string, string> = {
  "seer-self-heal": "الإصلاح الذاتي", "seer-subscriptions-daily": "تذكيرات الاشتراك اليومية", "seer-telegram-health": "فحص صحة تيليقرام", "seer-telegram-kick": "إرسال تيليقرام",
  "seer-telegram-daily": "ملخص تيليقرام اليومي", "seer-backup-watch": "مراقبة النسخ الاحتياطي",
};
/** Backup age: the last good one must be within 26 hours. */
export function backupFresh(lastOk: string | null | undefined, now: number = Date.now()): boolean {
  return Boolean(lastOk) && now - Date.parse(lastOk!) <= 26 * 3600_000;
}
export const viewSections: [string, string][] = [["dashboard", "الرئيسية"], ["students", "الطلاب والأطفال"], ["attendance", "الحضور"], ["finance", "المالية"], ["staff", "الفريق"], ["settings", "الإعدادات"]];
export const isViewSection = (value: unknown): value is string => typeof value === "string" && viewSections.some(([key]) => key === value);
/** What the read-only view does not mirror yet (the owner's other pages). */
export const notMirrored = ["التقارير اليومية", "الجدول والدرجات والسلوك", "النقل والرحلات", "الرواتب والإجازات", "الرسائل والإعلانات", "القبول والتسجيل", "التسليم والاستلام", "المهام والاستفسارات"];
/** The Supabase dashboard of this project, from its API address (https://<ref>.supabase.co). */
export function supabaseDashboard(url: string | undefined): string | null {
  const ref = (url ?? "").match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/)?.[1];
  return ref ? `https://supabase.com/dashboard/project/${ref}` : null;
}
