import { uuid, ValidationError } from "./operations";

export const inquiryCategories = ["general", "task", "leave", "supplies", "student", "finance", "other"] as const;
export type InquiryCategory = (typeof inquiryCategories)[number];
export const inquiryCategoryLabels: Record<InquiryCategory, string> = {
  general: "استفسار عام", task: "بخصوص مهمة", leave: "إجازة أو استئذان", supplies: "مستلزمات وطلبات", student: "بخصوص طالب", finance: "مالية", other: "أخرى",
};
export const inquiryStatuses = ["open", "answered", "closed"] as const;
export type InquiryStatus = (typeof inquiryStatuses)[number];
export const inquiryStatusLabels: Record<InquiryStatus, string> = { open: "بانتظار الرد", answered: "تم الرد", closed: "مغلق" };
export const inquiryStatusTone: Record<InquiryStatus, string> = { open: "coral", answered: "ok", closed: "" };
export type Inquiry = { id: string; author_id: string | null; category: InquiryCategory; subject: string; body: string; task_id: string | null; status: InquiryStatus; created_at: string; updated_at: string };
export type Reply = { id: string; author_id: string | null; body: string; created_at: string };
export type TaskComment = { id: string; task_id: string; author_id: string | null; body: string; created_at: string };

export function isInquiryStatus(value: unknown): value is InquiryStatus { return typeof value === "string" && inquiryStatuses.some(status => status === value); }
export function messageBody(data: FormData, key = "body", max = 2000): string {
  const value = data.get(key);
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > max) throw new ValidationError(`اكتب الرسالة، ${max.toLocaleString("ar-SA")} حرف كحد أقصى.`);
  return value.trim();
}
export function inquiryValues(data: FormData) {
  const subject = data.get("subject");
  if (typeof subject !== "string" || subject.trim().length < 1 || subject.trim().length > 120) throw new ValidationError("اكتب عنوان الاستفسار، ١٢٠ حرف كحد أقصى.");
  const category = data.get("category");
  if (typeof category !== "string" || !inquiryCategories.some(item => item === category)) throw new ValidationError("اختر نوع الاستفسار.");
  const task = data.get("task_id");
  return { subject: subject.trim(), category: category as InquiryCategory, body: messageBody(data), task_id: task ? uuid(task) : null };
}
/** Short relative time in Arabic for message threads. */
export function since(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return "الحين";
  if (minutes < 60) return `قبل ${minutes.toLocaleString("ar-SA")} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `قبل ${hours.toLocaleString("ar-SA")} ساعة`;
  return new Date(iso).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", day: "numeric", month: "short" });
}
