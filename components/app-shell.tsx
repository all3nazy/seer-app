"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, Logo, type IconName } from "./icons";
import { SoundToggle, ThemeToggle } from "./preferences";
import { FeedbackLayer } from "./feedback";
import SignOutButton from "./sign-out-button";

const links: { href: string; label: string; short: string; icon: IconName; desktopOnly?: boolean }[] = [
  { href: "/dashboard", label: "لوحة التشغيل", short: "الرئيسية", icon: "home" },
  { href: "/dashboard/my", label: "مهامي", short: "مهامي", icon: "check" },
  { href: "/dashboard/tasks", label: "المهام", short: "المهام", icon: "board" },
  { href: "/dashboard/attendance", label: "الحضور", short: "الحضور", icon: "clock" },
  { href: "/dashboard/classes", label: "متابعة الفصول", short: "الفصول", icon: "list", desktopOnly: true },
  { href: "/dashboard/children", label: "الطلاب", short: "الطلاب", icon: "child", desktopOnly: true },
  { href: "/dashboard/inquiries", label: "استفسارات الموظفين", short: "الاستفسارات", icon: "chat", desktopOnly: true },
  { href: "/dashboard/admissions", label: "القبول والتسجيل", short: "القبول", icon: "flag", desktopOnly: true },
  { href: "/dashboard/academics", label: "الهيكل الدراسي", short: "الصفوف", icon: "list", desktopOnly: true },
  { href: "/dashboard/operations", label: "السجلات", short: "السجلات", icon: "folder", desktopOnly: true },
  { href: "/dashboard/team", label: "الفريق", short: "الفريق", icon: "users", desktopOnly: true },
  { href: "/dashboard/audit", label: "سجل التدقيق", short: "التدقيق", icon: "shield", desktopOnly: true },
  { href: "/dashboard/assistant", label: "المساعد", short: "المساعد", icon: "spark" },
  { href: "/dashboard/settings", label: "الإعدادات", short: "الإعدادات", icon: "settings", desktopOnly: true },
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
      <header className="mobile-bar"><Logo href="/dashboard" label="سِير — لوحة التشغيل" /><div style={{ display: "flex", gap: 6, alignItems: "center" }}><Link className="icon-btn" href="/dashboard/operations" aria-label="السجلات"><Icon name="folder" /></Link><Link className="icon-btn" href="/dashboard/settings" aria-label="الإعدادات"><Icon name="settings" /></Link><ThemeToggle /></div></header>
      <main className={`main${path === "/dashboard" || path.startsWith("/dashboard/tasks") ? " wide" : ""}`} id="main-content" tabIndex={-1}>{children}</main>
    </div>
    <nav className="tabbar" aria-label="التنقل السفلي">
      {links.filter(link => !link.desktopOnly).map(link => <Link key={link.href} href={link.href} aria-current={current(link.href)}><Icon name={link.icon} />{link.short}</Link>)}
    </nav>
    <FeedbackLayer />
  </div>;
}
