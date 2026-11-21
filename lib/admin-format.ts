import { arNumber, formatDate } from "./dates";

/** «سِير أدمن»: Arabic labels for what the log records, and short relative times. */
export const auditLabels: Record<string, string> = {
  org_extended: "تمديد الاشتراك", org_free_month: "شهر مجاني", org_plan_changed: "تغيير الباقة", org_suspended: "إيقاف مؤقت", org_resumed: "استئناف الاشتراك",
  org_cancelled: "إلغاء الاشتراك", login_unlocked: "فك قفل دخول", ownership_transferred: "نقل الملكية", entitlements_updated: "تعديل الأقسام المتاحة",
  onboarding_reminded: "تذكير بالتأسيس", note_saved: "تعديل الملاحظات الخاصة",
  telegram_link_code: "رمز ربط تيليقرام", telegram_close_ticket: "تيليقرام: إقفال تذكرة", telegram_reply_ticket: "تيليقرام: رد على تذكرة", telegram_template_reply: "تيليقرام: رد بقالب",
  telegram_approve_payment: "تيليقرام: اعتماد تحويل", telegram_reject_payment: "تيليقرام: رفض تحويل", telegram_invite_join_request: "تيليقرام: دعوة من طلب انضمام",
  telegram_reject_join_request: "تيليقرام: رفض طلب انضمام", telegram_linked: "ربط تيليقرام", telegram_unlinked: "فك ربط تيليقرام",
  join_request_invite: "دعوة من طلب انضمام", join_request_reject: "رفض طلب انضمام", org_invite_created: "إنشاء دعوة منشأة", org_invite_revoked: "إلغاء دعوة منشأة",
  org_invite_reissued: "رابط دعوة جديد", org_invite_used: "تفعيل منشأة بدعوة", plan_created: "إضافة باقة", plan_updated: "تعديل باقة", duration_updated: "تعديل خصم مدة",
  settings_updated: "تعديل إعدادات الدفع", template_created: "إضافة قالب رد", template_updated: "تعديل قالب رد",
  coupon_created: "إضافة كوبون", coupon_updated: "تعديل كوبون", coupon_disabled: "إيقاف كوبون", invoice_issued: "إصدار فاتورة", broadcast_sent: "رسالة للمشتركين",
  ip_blocked: "حظر عنوان IP", ip_unblocked: "رفع حظر عنوان IP", login_lock_released: "فك قفل دخول (صفحة الأمان)", audit_exported: "تصدير السجل",
  admin_invited: "إضافة عضو لفريق الإدارة", admin_role_changed: "تغيير دور في الفريق", admin_removed: "إزالة من فريق الإدارة",
  backup_started: "نسخة احتياطية يدوية", backup_downloaded: "تحميل ملف نسخة احتياطية", org_exported: "تصدير بيانات المنشأة", error_handled: "معالجة خطأ في النظام",
  org_viewed: "مشاهدة المنصة كأنك هم",
  payment_pending: "تحويل جديد بانتظار التأكيد", payment_approved: "اعتماد تحويل", payment_rejected: "رفض تحويل", join_request: "طلب انضمام جديد", support_thread: "تذكرة دعم جديدة",
};
export const auditLabel = (action: string) => auditLabels[action] ?? action;

/** The pill of an activity entry: its kind and colour class. */
export function activityPill(kind: string, action: string): { label: string; tone: "ok" | "plum" | "rose" | "sun" | "" } {
  if (kind === "payment") return { label: "اشتراك", tone: action === "payment_rejected" ? "rose" : "ok" };
  if (kind === "join") return { label: "انضمام", tone: "plum" };
  if (kind === "support") return { label: "دعم", tone: "sun" };
  if (/login|lock/.test(action)) return { label: "حماية", tone: "rose" };
  return { label: "إدارة", tone: "" };
}

const plural = (n: number, one: string, two: string, few: string, many: string) => n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${arNumber(n)} ${few}` : `${arNumber(n)} ${many}`;
/** «الآن», «قبل ١٠ دقائق», «قبل ساعتين», «أمس», then the date. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `قبل ${plural(minutes, "دقيقة", "دقيقتين", "دقائق", "دقيقة")}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `قبل ${plural(hours, "ساعة", "ساعتين", "ساعات", "ساعة")}`;
  const days = Math.round(hours / 24);
  if (days === 1) return "أمس";
  if (days < 7) return `قبل ${plural(days, "يوم", "يومين", "أيام", "يوم")}`;
  return formatDate(iso, { year: true });
}

/** A day count: «يوم», «يومين», «٣ أيام», «١٥ يوم». */
export const dayCount = (n: number) => n === 1 ? "يوم" : n === 2 ? "يومين" : n >= 3 && n <= 10 ? `${arNumber(n)} أيام` : `${arNumber(n)} يوم`;

/** Subscription state for a pill. */
export function statusPill(status: string | null | undefined, access: string): { label: string; tone: "ok" | "rose" | "sun" | "plum" } {
  if (status === "suspended") return { label: "موقوف مؤقتًا", tone: "rose" };
  if (access === "locked") return { label: "مقفل", tone: "rose" };
  if (access === "grace") return { label: "في المهلة", tone: "sun" };
  if (status === "trial") return { label: "تجربة", tone: "plum" };
  return { label: "نشط", tone: "ok" };
}

/** Arabic page numbers around the current one (with gaps), for the subscribers list. */
export function pageList(current: number, last: number): (number | "…")[] {
  const pages = new Set([1, last, current - 1, current, current + 1].filter(n => n >= 1 && n <= last));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((n, index) => { if (index && n - sorted[index - 1] > 1) out.push("…"); out.push(n); });
  return out;
}

// The subscribers list -------------------------------------------------------------------------------
export type SubscriberQuery = { q: string; status: string; plan: string; ending: boolean; sort: string; page: number };
export const PER_PAGE = 25;
export const statusFilters: [string, string][] = [["", "كل الحالات"], ["active", "نشط"], ["trial", "تجربة"], ["grace", "في المهلة"], ["locked", "مقفل"], ["suspended", "موقوف مؤقتًا"]];
export const sortOptions: [string, string][] = [["ending", "الأقرب انتهاءً"], ["newest", "الأحدث"], ["name", "الاسم"], ["students", "الأكثر طلابًا"]];

/** The query string for a page of the list, keeping the filters. */
export function listHref(query: SubscriberQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.plan) params.set("plan", query.plan);
  if (query.ending) params.set("ending", "1");
  if (query.sort && query.sort !== "ending") params.set("sort", query.sort);
  if (page > 1) params.set("page", String(page));
  const text = params.toString();
  return `/admin/subscribers${text ? `?${text}` : ""}`;
}

