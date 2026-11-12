import { navLinks } from "./navigation";

export type SupportTemplate = { id: number; title: string; body: string; path: string | null; keywords: string[]; sort_order: number; is_active: boolean; suggested: boolean };

/** The reply as sent: the text, then the page as a full link on the official address (same as the database). */
export function templateText(template: Pick<SupportTemplate, "body" | "path">, site: string): string {
  const body = template.body.trim();
  return template.path ? `${body}\n\n🔗 ${site.replace(/\/+$/, "")}${template.path}` : body;
}

/** Pages a template can point to: the dashboard sections, and the settings tabs. */
export const templatePages: { path: string; label: string }[] = [
  ...navLinks.filter(link => link.href.startsWith("/dashboard")).map(link => ({ path: link.href, label: link.label })),
  { path: "/dashboard/billing", label: "الاشتراك" },
  { path: "/dashboard/settings#account", label: "الإعدادات ← حسابي" },
  { path: "/dashboard/settings#organization", label: "الإعدادات ← المنشأة" },
  { path: "/dashboard/settings#device", label: "الإعدادات ← الجهاز والإشعارات" },
  { path: "/dashboard/settings#help", label: "الإعدادات ← المساعدة" },
].filter((page, index, all) => all.findIndex(other => other.path === page.path) === index);

export const templatePathPattern = /^\/dashboard(\/[a-z0-9-]+)*(#[a-z-]+)?$/;
