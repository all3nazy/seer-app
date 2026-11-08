import type { IconName } from "../components/icons";

/**
 * Every dashboard section. `phone: false` sections are the full version for computers and iPads;
 * on a phone they are hidden from menus, and opening one shows a short notice instead.
 * `tab` places a section in the bottom bar used on phones and tablets.
 */
export type NavGroup = "today" | "students" | "admin";
export const navGroupLabels: Record<NavGroup, string> = { today: "اليوم", students: "الطلاب والدراسة", admin: "الإدارة" };
export type NavLink = { href: string; label: string; short: string; icon: IconName; phone: boolean; group: NavGroup | null; tab?: boolean; exact?: boolean };
export const navLinks: NavLink[] = [
  { href: "/dashboard", label: "لوحة التشغيل", short: "الرئيسية", icon: "home", group: "today", phone: true, tab: true, exact: true },
  { href: "/dashboard/my", label: "مهامي", short: "مهامي", icon: "check", group: "today", phone: true, tab: true },
  { href: "/dashboard/attendance", label: "الحضور", short: "الحضور", icon: "clock", group: "today", phone: true, tab: true },
  { href: "/dashboard/pickup", label: "تسليم الطلاب", short: "التسليم", icon: "pickup", group: "today", phone: true, tab: true },
  { href: "/dashboard/daily", label: "التقرير اليومي", short: "التقرير", icon: "calendar", group: "today", phone: true },
  { href: "/dashboard/announcements", label: "الإعلانات", short: "الإعلانات", icon: "bell", group: "today", phone: true },
  { href: "/dashboard/children", label: "الطلاب", short: "الطلاب", icon: "child", group: "students", phone: true },
  { href: "/dashboard/classes", label: "متابعة الفصول", short: "الفصول", icon: "chart", group: "today", phone: true },
  { href: "/dashboard/inquiries", label: "استفسارات الموظفين", short: "الاستفسارات", icon: "chat", group: "admin", phone: true },
  { href: "/dashboard/assistant", label: "المساعد", short: "المساعد", icon: "spark", group: null, phone: true },
  { href: "/dashboard/tasks", label: "لوحة المهام", short: "المهام", icon: "board", group: "admin", phone: false, exact: true },
  { href: "/dashboard/finance", label: "المالية", short: "المالية", icon: "wallet", group: "admin", phone: false },
  { href: "/dashboard/admissions", label: "القبول والتسجيل", short: "القبول", icon: "flag", group: "students", phone: false },
  { href: "/dashboard/academics", label: "الهيكل الدراسي", short: "الصفوف", icon: "school", group: "students", phone: false },
  { href: "/dashboard/operations", label: "السجلات", short: "السجلات", icon: "folder", group: "admin", phone: false },
  { href: "/dashboard/team", label: "الفريق", short: "الفريق", icon: "users", group: "admin", phone: false },
  { href: "/dashboard/audit", label: "سجل التدقيق", short: "التدقيق", icon: "shield", group: "admin", phone: false },
  { href: "/dashboard/settings", label: "الإعدادات", short: "الإعدادات", icon: "settings", group: null, phone: true },
];

export function matches(link: Pick<NavLink, "href" | "exact">, path: string): boolean {
  return link.exact ? path === link.href : path === link.href || path.startsWith(`${link.href}/`);
}
/** The computer-only section a path belongs to, if any. Task pages stay open on phones. */
export function computerOnlySection(path: string): NavLink | undefined {
  return navLinks.find(link => !link.phone && matches(link, path));
}
