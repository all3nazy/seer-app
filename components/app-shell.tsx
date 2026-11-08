"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, Logo } from "./icons";
import { SoundToggle, ThemeToggle } from "./preferences";
import { FeedbackLayer } from "./feedback";
import SignOutButton from "./sign-out-button";
import { computerOnlySection, matches, navLinks } from "../lib/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const current = (link: (typeof navLinks)[number]) => matches(link, path) ? "page" as const : undefined;
  const fullOnly = computerOnlySection(path);
  const tabs = navLinks.filter(link => link.tab);
  const inMore = !tabs.some(link => matches(link, path));
  return <div className="app">
    <a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a>
    <aside className="sidebar" aria-label="القائمة الجانبية">
      <Logo href="/dashboard" label="سِير — لوحة التشغيل" />
      <nav aria-label="التنقل الرئيسي" style={{ display: "grid", gap: 4 }}>
        {navLinks.map(link => <Link key={link.href} className="nav-link" href={link.href} aria-current={current(link)}><Icon name={link.icon} />{link.label}</Link>)}
      </nav>
      <div className="help-card"><span className="tile-icon lg tone-sun"><Icon name="help" /></span><strong>تحتاج مساعدة؟</strong><span>عندك مشكلة في استخدام سِير؟</span><Link href="/dashboard/settings">الدعم والإعدادات</Link></div>
      <div className="sidebar-foot"><ThemeToggle /><SoundToggle /><SignOutButton compact /></div>
    </aside>
    <div style={{ minWidth: 0 }}>
      <header className="mobile-bar"><Logo href="/dashboard" label="سِير — لوحة التشغيل" /><div style={{ display: "flex", gap: 6, alignItems: "center" }}><ThemeToggle /></div></header>
      <main className={`main${path === "/dashboard" || path === "/dashboard/tasks" ? " wide" : ""}`} id="main-content" tabIndex={-1}>
        {fullOnly ? <>
          <section className="card phone-notice" aria-live="polite">
            <span className="tile-icon lg tone-sky" aria-hidden="true"><Icon name={fullOnly.icon} /></span>
            <h1 style={{ fontSize: 20 }}>{fullOnly.label} على الكمبيوتر أو الآيباد</h1>
            <p>نسخة الجوال مخصصة للعمل اليومي. افتح هذا القسم من الكمبيوتر أو الآيباد.</p>
            <Link className="btn" href="/dashboard/more">الأقسام المتاحة على الجوال</Link>
          </section>
          <div className="phone-hidden">{children}</div>
        </> : children}
      </main>
    </div>
    <nav className="tabbar" aria-label="التنقل السفلي">
      {tabs.map(link => <Link key={link.href} href={link.href} aria-current={current(link)}><Icon name={link.icon} />{link.short}</Link>)}
      <Link href="/dashboard/more" aria-current={inMore ? "page" : undefined}><Icon name="list" />المزيد</Link>
    </nav>
    <FeedbackLayer />
  </div>;
}
