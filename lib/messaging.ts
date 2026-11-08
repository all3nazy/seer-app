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
/**
 * What a school may change: the channel and which messages go out. The provider account, sender
 * name and link domain are platform settings (they spend the platform's paid accounts and shape
 * the links families open), so they are set by the platform team, not from the school's page.
 */
export function messageSettingsValues(data: FormData) {
  return {
    channel: data.get("channel") === "sms" ? "sms" : "whatsapp",
    ...Object.fromEntries(toggles.map(([key]) => [key, data.get(key) === "on"])),
  };
}
/** International number for providers (9665XXXXXXXX), or null. */
export function e164(phone: string): string | null { return whatsappNumber(phone); }
