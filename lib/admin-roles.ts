/**
 * The platform team's roles in «سِير أدمن». The database decides (private.require_platform_admin
 * with the role); the console hides what a role cannot do so nobody meets a refusal.
 *   owner   — everything
 *   support — support tickets and reply templates; organization profiles read-only
 *   finance — transfers, invoices and coupons; organizations read-only
 */
export type AdminRole = "owner" | "support" | "finance";
export const adminRoles: AdminRole[] = ["owner", "support", "finance"];
export const adminRoleLabels: Record<AdminRole, string> = { owner: "مالك", support: "دعم", finance: "مالية" };
export const adminRoleNotes: Record<AdminRole, string> = {
  owner: "كل شيء، ومنها الفريق والحماية والسجل",
  support: "تذاكر الدعم وقوالب الردود، وملفات المنشآت قراءة فقط",
  finance: "التحويلات والفواتير والكوبونات، والمنشآت قراءة فقط",
};
export const isAdminRole = (value: unknown): value is AdminRole => typeof value === "string" && (adminRoles as string[]).includes(value);

/** Whether a role may use something allowed to `roles` (the owner always may). */
export function roleAllows(role: AdminRole, roles: readonly AdminRole[] = []): boolean {
  return role === "owner" || roles.includes(role);
}

/** What each role may open (besides the owner). Pages not listed are owner-only. */
export const pageRoles: Record<string, AdminRole[]> = {
  "/admin": ["support", "finance"],
  "/admin/subscribers": ["support", "finance"],
  "/admin/payments": ["finance"],
  "/admin/coupons": ["finance"],
  "/admin/invoices": ["finance"],
  "/admin/support": ["support"],
  "/admin/support/templates": ["support"],
};
/** The roles for a path: its longest listed prefix (so /admin/subscribers/<id> is like the list). */
export function rolesForPath(path: string): AdminRole[] {
  let best = "";
  for (const prefix of Object.keys(pageRoles)) {
    // «/admin» itself is the overview only, not a prefix of every page.
    const hit = path === prefix || (prefix !== "/admin" && path.startsWith(`${prefix}/`));
    if (hit && prefix.length > best.length) best = prefix;
  }
  return best ? pageRoles[best] : [];
}
