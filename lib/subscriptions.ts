import { arNumber } from "./dates";
/**
 * Subscriptions in the app: section (feature) names, which page belongs to which section, plan
 * pricing for display (the database computes the amount that is actually charged), and states.
 */
export const featureKeys = ["pickup", "daily", "messages", "announcements", "inquiries", "tasks", "finance", "admissions", "staff", "assistant", "transport", "learning", "payroll", "reports", "online_payments"] as const;
export type FeatureKey = (typeof featureKeys)[number];
export const featureLabels: Record<FeatureKey, string> = {
  pickup: "تسليم الطلاب وتأكيد الاستلام", daily: "التقرير اليومي", messages: "الرسائل التلقائية", announcements: "الإعلانات", inquiries: "استفسارات الموظفين",
  tasks: "لوحة المهام", finance: "المالية والفواتير وعروض الأسعار", admissions: "القبول والتسجيل", staff: "الموظفين والإجازات", assistant: "المساعد الذكي",
  transport: "النقل والباصات", learning: "الدراسة والجداول والدرجات", payroll: "مسير الرواتب", reports: "تقارير الإدارة", online_payments: "الدفع الإلكتروني",
};
export function isFeature(value: string): value is FeatureKey { return (featureKeys as readonly string[]).includes(value); }

/** Pages that belong to a section; anything not listed is part of the core and always available. */
export const featureByPath: [string, FeatureKey][] = [
  ["/dashboard/pickup", "pickup"], ["/dashboard/daily", "daily"], ["/dashboard/messages", "messages"], ["/dashboard/announcements", "announcements"],
  ["/dashboard/inquiries", "inquiries"], ["/dashboard/tasks", "tasks"], ["/dashboard/finance/online", "online_payments"], ["/dashboard/finance", "finance"],
  ["/dashboard/admissions", "admissions"], ["/dashboard/staff/payroll", "payroll"], ["/dashboard/staff", "staff"], ["/dashboard/assistant", "assistant"],
  ["/dashboard/transport", "transport"], ["/dashboard/learning", "learning"], ["/dashboard/reports", "reports"],
];
export function featureOf(path: string): FeatureKey | null {
  return featureByPath.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? null;
}

export type OrgFeatures = { features: string[]; disabled: string[] };
/** "on": usable; "off": turned off by the organization (hidden); "locked": outside the plan (shown with a lock). */
export function featureState(feature: FeatureKey | null, org: OrgFeatures | null): "on" | "off" | "locked" {
  if (!feature || !org) return "on";
  if (!org.features.includes(feature)) return "locked";
  if (org.disabled.includes(feature)) return "off";
  return "on";
}

export type Plan = { id: string; key: string; name: string; description: string | null; features: string[]; monthly_price: number };
export type Duration = { months: number; discount: number };
/** For display only; mirrors private.quote_amount in the database, which decides the real amount. */
export function priceFor(plan: Pick<Plan, "monthly_price">, duration: Duration): number {
  return Math.round(Number(plan.monthly_price) * duration.months * (1 - Number(duration.discount) / 100) * 100) / 100;
}
export const durationLabel = (months: number) => months === 1 ? "شهر" : months === 12 ? "سنة" : `${arNumber(months)} أشهر`;
export const riyal = (value: number) => `${arNumber(Number(value), { max: 2 })} ر.س`;

export type Access = "active" | "grace" | "locked";
export const accessLabels: Record<Access, string> = { active: "فعّال", grace: "مهلة التجديد", locked: "مقفل" };
export const statusLabels: Record<string, string> = { trial: "تجربة مجانية", active: "فعّال", grace: "مهلة التجديد", locked: "مقفل", suspended: "موقوف" };
export const paymentStatusLabels: Record<string, string> = { pending: "قيد المراجعة", approved: "معتمد", rejected: "مرفوض" };

export type MyOrg = { organization_id: string; name: string; type: string; role: string; display_name?: string | null; legal_version?: string | null; access: Access; status: string | null; ends_on: string | null; days_left: number | null; plan_key: string | null; features: string[]; disabled_features: string[]; primary_color: string | null; accent_color: string | null };
/** The banner shown in the last days and during the grace period. */
export function renewalNotice(org: Pick<MyOrg, "access" | "status" | "days_left"> | null, graceDays = 7): string | null {
  if (!org || org.days_left === null || org.status === "suspended") return null;
  if (org.access === "grace") {
    const left = graceDays + org.days_left;
    return `انتهى الاشتراك. المنصة تعمل في مهلة التجديد${left >= 0 ? ` لمدة ${arNumber(left)} يوم` : ""}، وتنقفل بعدها حتى التجديد.`;
  }
  if (org.access === "active" && org.days_left >= 0 && org.days_left <= 7) {
    const trial = org.status === "trial";
    return org.days_left === 0 ? `${trial ? "التجربة المجانية" : "الاشتراك"} ينتهي اليوم.` : `باقي ${arNumber(org.days_left)} يوم على نهاية ${trial ? "التجربة المجانية" : "الاشتراك"}.`;
  }
  return null;
}
