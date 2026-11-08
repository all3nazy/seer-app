import type { IconName } from "../components/icons";

/**
 * Every dashboard section. `phone: false` sections are the full version for computers and iPads;
 * on a phone they are hidden from menus, and opening one shows a short notice instead.
 * `tab` places a section in the bottom bar used on phones and tablets.
 */
export type NavLink = { href: string; label: string; short: string; icon: IconName; phone: boolean; tab?: boolean; exact?: boolean };
export const navLinks: NavLink[] = [
  { href: "/dashboard", label: "لوحة التشغيل", short: "الرئيسية", icon: "home", phone: true, tab: true, exact: true },
  { href: "/dashboard/my", label: "مهامي", short: "مهامي", icon: "check", phone: true, tab: true },
  { href: "/dashboard/attendance", label: "الحضور", short: "الحضور", icon: "clock", phone: true, tab: true },
  { href: "/dashboard/pickup", label: "تسليم الطلاب", short: "التسليم", icon: "users", phone: true, tab: true },
  { href: "/dashboard/children", label: "الطلاب", short: "الطلاب", icon: "child", phone: true },
  { href: "/dashboard/classes", label: "متابعة الفصول", short: "الفصول", icon: "list", phone: true },
  { href: "/dashboard/inquiries", label: "استفسارات الموظفين", short: "الاستفسارات", icon: "chat", phone: true },
  { href: "/dashboard/assistant", label: "المساعد", short: "المساعد", icon: "spark", phone: true },
  { href: "/dashboard/tasks", label: "لوحة المهام", short: "المهام", icon: "board", phone: false, exact: true },
  { href: "/dashboard/finance", label: "المالية", short: "المالية", icon: "wallet", phone: false },
  { href: "/dashboard/admissions", label: "القبول والتسجيل", short: "القبول", icon: "flag", phone: false },
  { href: "/dashboard/academics", label: "الهيكل الدراسي", short: "الصفوف", icon: "list", phone: false },
  { href: "/dashboard/operations", label: "السجلات", short: "السجلات", icon: "folder", phone: false },
  { href: "/dashboard/team", label: "الفريق", short: "الفريق", icon: "users", phone: false },
  { href: "/dashboard/audit", label: "سجل التدقيق", short: "التدقيق", icon: "shield", phone: false },
  { href: "/dashboard/settings", label: "الإعدادات", short: "الإعدادات", icon: "settings", phone: true },
];

export function matches(link: Pick<NavLink, "href" | "exact">, path: string): boolean {
  return link.exact ? path === link.href : path === link.href || path.startsWith(`${link.href}/`);
}
/** The computer-only section a path belongs to, if any. Task pages stay open on phones. */
export function computerOnlySection(path: string): NavLink | undefined {
  return navLinks.find(link => !link.phone && matches(link, path));
}
