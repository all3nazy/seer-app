"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, Logo, type IconName } from "./icons";
import { SoundToggle, ThemeToggle } from "./preferences";
import { FeedbackLayer } from "./feedback";
import SignOutButton from "./sign-out-button";

const links: { href: string; label: string; short: string; icon: IconName; desktopOnly?: boolean }[] = [
  { href: "/dashboard", label: "لوحة التشغيل", short: "الرئيسية", icon: "home" },
  { href: "/dashboard/tasks", label: "المهام", short: "المهام", icon: "board" },
  { href: "/dashboard/operations", label: "السجلات", short: "السجلات", icon: "folder" },
  { href: "/dashboard/team", label: "الفريق", short: "الفريق", icon: "users", desktopOnly: true },
  { href: "/dashboard/assistant", label: "المساعد", short: "المساعد", icon: "spark" },
  { href: "/dashboard/settings", label: "الإعدادات", short: "الإعدادات", icon: "settings" },
];
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const current = (href: string) => (href === "/dashboard" ? path === href : path.startsWith(href)) ? "page" as const : undefined;
  return <div className="app">
    <a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a>
    <aside className="sidebar" aria-label="القائمة الجانبية">
      <Logo href="/dashboard" label="سِير — لوحة التشغيل" />
      <nav aria-label="التنقل الرئيسي" style={{ display: "grid", gap: 4 }}>
        {links.map(link => <Link key={link.href} className="nav-link" href={link.href} aria-current={current(link.href)}><Icon name={link.icon} />{link.label}</Link>)}
      </nav>
      <div className="help-card"><span className="tile-icon lg tone-sun"><Icon name="help" /></span><strong>تحتاج مساعدة؟</strong><span>عندك مشكلة في استخدام سِير؟</span><Link href="/dashboard/settings">الدعم والإعدادات</Link></div>
      <div className="sidebar-foot"><ThemeToggle /><SoundToggle /><SignOutButton compact /></div>
    </aside>
    <div style={{ minWidth: 0 }}>
      <header className="mobile-bar"><Logo href="/dashboard" label="سِير — لوحة التشغيل" /><div><ThemeToggle /></div></header>
      <main className={`main${path === "/dashboard" || path.startsWith("/dashboard/tasks") ? " wide" : ""}`} id="main-content" tabIndex={-1}>{children}</main>
    </div>
    <nav className="tabbar" aria-label="التنقل السفلي">
      {links.filter(link => !link.desktopOnly).map(link => <Link key={link.href} href={link.href} aria-current={current(link.href)}><Icon name={link.icon} />{link.short}</Link>)}
    </nav>
    <FeedbackLayer />
  </div>;
}
