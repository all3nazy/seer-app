import { whatsappNumber } from "./share";

export const messageProviders = ["manual", "whatsapp_cloud", "taqnyat", "unifonic", "msegat", "twilio"] as const;
export type MessageProvider = (typeof messageProviders)[number];
export const messageProviderLabels: Record<MessageProvider, string> = {
  manual: "يدوي: إرسال بضغطة من واتساب الجوال", whatsapp_cloud: "واتساب للأعمال (Meta Cloud API)", taqnyat: "تقنيات (SMS)", unifonic: "يونيفونك", msegat: "مسجات (SMS)", twilio: "Twilio",
};
export const messageKindLabels: Record<string, string> = { absence: "غياب", late: "تأخير", pickup: "انصراف", pickup_confirm: "تأكيد استلام", bus: "الباص", invoice: "فاتورة", daily_report: "التقرير اليومي", announcement: "إعلان", custom: "رسالة" };
export const messageStatusLabels: Record<string, string> = { queued: "بالانتظار", sending: "قيد الإرسال", sent: "أُرسلت", failed: "فشلت", skipped: "تُجوهلت" };
export const toggles = [
  ["notify_absence", "إشعار الغياب لولي الأمر"], ["notify_late", "إشعار التأخير"], ["notify_pickup", "إشعار الانصراف (مين استلم ومتى)"],
  ["confirm_pickup", "رابط تأكيد الاستلام برقم الهوية للمستلم"], ["notify_bus", "حركة الباص (صعد / نزل)"], ["notify_invoice", "الفاتورة الجديدة مع رابط الدفع"], ["notify_daily_report", "التقرير اليومي جاهز"],
] as const;
/** Live providers the dispatcher can already call once their keys are in the server environment. */
export const dispatchReady: MessageProvider[] = ["taqnyat", "whatsapp_cloud"];
export function messageSettingsValues(data: FormData) {
  const provider = String(data.get("provider") ?? "manual");
  if (!messageProviders.includes(provider as MessageProvider)) throw new Error("مزوّد غير صالح.");
  const site = String(data.get("site_url") ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(site)) throw new Error("رابط المنصة يبدأ بـ https:// وبدون مسار.");
  const sender = String(data.get("sender_name") ?? "").trim();
  if (sender && (sender.length < 2 || sender.length > 40)) throw new Error("اسم المرسل من ٢ إلى ٤٠ حرفًا.");
  return {
    provider, channel: data.get("channel") === "sms" ? "sms" : "whatsapp", sender_name: sender || null, site_url: site,
    ...Object.fromEntries(toggles.map(([key]) => [key, data.get(key) === "on"])),
  };
}
/** International number for providers (9665XXXXXXXX), or null. */
export function e164(phone: string): string | null { return whatsappNumber(phone); }
