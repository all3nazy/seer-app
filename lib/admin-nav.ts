import { roleAllows, rolesForPath, type AdminRole } from "./admin-roles";

/**
 * The sidebar of «سِير أدمن» (approved design): groups and their pages. Only pages that exist are
 * listed; each role sees only what it may open (lib/admin-roles.ts).
 */
export type AdminNavItem = { href: string; label: string; count?: "payments" | "support" | "requests"; exact?: boolean };
export type AdminNavGroup = { title: string | null; items: AdminNavItem[] };

export const adminNav: AdminNavGroup[] = [
  { title: null, items: [{ href: "/admin", label: "نظرة عامة", exact: true }] },
  { title: "المشتركين", items: [
    { href: "/admin/subscribers", label: "المنشآت" },
    { href: "/admin/join-requests", label: "طلبات الانضمام", count: "requests" },
    { href: "/admin/invites", label: "دعوات المنشآت" },
  ] },
  { title: "الإيرادات", items: [
    { href: "/admin/payments", label: "التحويلات البنكية", count: "payments" },
    { href: "/admin/invoices", label: "الفواتير والإيصالات" },
    { href: "/admin/coupons", label: "الكوبونات والعروض" },
    { href: "/admin/plans", label: "الباقات والأسعار" },
  ] },
  { title: "الدعم والتواصل", items: [
    { href: "/admin/support", label: "تذاكر الدعم", count: "support" },
    { href: "/admin/support/templates", label: "قوالب الردود" },
    { href: "/admin/broadcast", label: "رسالة للمشتركين" },
  ] },
  { title: "المنصة", items: [
    { href: "/admin/settings", label: "الدفع والتليقرام", exact: true },
    { href: "/admin/team", label: "فريق الإدارة" },
  ] },
  { title: "الحماية والتشغيل", items: [
    { href: "/admin/health", label: "صحة النظام" },
    { href: "/admin/backups", label: "النسخ الاحتياطي" },
    { href: "/admin/security", label: "أمان الدخول" },
    { href: "/admin/audit", label: "سجل العمليات" },
  ] },
];

/** The sidebar for a role: only what it may open; empty groups disappear. */
export function adminNavFor(role: AdminRole): AdminNavGroup[] {
  return adminNav.map(group => ({ ...group, items: group.items.filter(item => roleAllows(role, rolesForPath(item.href.split("#")[0]))) })).filter(group => group.items.length);
}

/** The item for a path: the longest matching href (so /admin/support/templates is not «تذاكر الدعم»). */
export function activeAdminItem(path: string): string | null {
  let best: string | null = null;
  for (const group of adminNav) for (const item of group.items) {
    if (item.href.includes("#")) continue; // a section of another page
    const hit = item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
    if (hit && (!best || item.href.length > best.length)) best = item.href;
  }
  return best;
}
