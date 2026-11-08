"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon, Logo } from "./icons";
import { SoundToggle, ThemeToggle } from "./preferences";
import { FeedbackLayer } from "./feedback";
import SignOutButton from "./sign-out-button";
import { BotDock } from "./bot-dock";
import { computerOnlySection, matches, navGroupLabels, navLinks, type NavGroup } from "../lib/navigation";
import { patternUrl, type Stage } from "../lib/stage";

type ShellProps = { children: React.ReactNode; stage: Stage; organizations: { id: string; name: string }[]; supportPhone: string };

export function AppShell({ children, stage, organizations, supportPhone }: ShellProps) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("seer-sidebar") === "rail"); } catch { /* storage unavailable */ } }, []);
  const toggle = () => setCollapsed(value => { try { localStorage.setItem("seer-sidebar", value ? "full" : "rail"); } catch { /* ignore */ } return !value; });
  const current = (link: (typeof navLinks)[number]) => matches(link, path) ? "page" as const : undefined;
  const fullOnly = computerOnlySection(path);
  const tabs = navLinks.filter(link => link.tab);
  const inMore = !tabs.some(link => matches(link, path));
  const groups = (Object.keys(navGroupLabels) as NavGroup[]).map(group => ({ group, links: navLinks.filter(link => link.group === group) }));
  const settings = navLinks.find(link => link.href === "/dashboard/settings")!;
  return <div className={`app stage-${stage}${collapsed ? " is-rail" : ""}`}>
    <div className="stage-pattern" aria-hidden="true" style={{ WebkitMaskImage: patternUrl(stage), maskImage: patternUrl(stage) }} />
    <a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a>
    <aside className="sidebar" aria-label="القائمة الجانبية">
      <div className="sidebar-head">
        <Logo href="/dashboard" label="سِير — لوحة التشغيل" />
        <button type="button" className="rail-toggle" onClick={toggle} aria-pressed={collapsed} aria-label={collapsed ? "توسيع القائمة" : "تصغير القائمة"} title={collapsed ? "توسيع القائمة" : "تصغير القائمة"}>
          <Icon name={collapsed ? "arrowNext" : "arrowPrev"} />
        </button>
      </div>
      <nav aria-label="التنقل الرئيسي" className="sidebar-nav">
        {groups.map(({ group, links }) => <div key={group} className="nav-group">
          <span className="nav-group-label">{navGroupLabels[group]}</span>
          {links.map(link => <Link key={link.href} className="nav-link" href={link.href} aria-current={current(link)} title={collapsed ? link.label : undefined}>
            <Icon name={link.icon} /><span className="nav-text">{link.label}</span>
          </Link>)}
        </div>)}
      </nav>
      <div className="sidebar-foot">
        <Link className="nav-link" href={settings.href} aria-current={current(settings)} title={collapsed ? settings.label : undefined}><Icon name="settings" /><span className="nav-text">{settings.label}</span></Link>
        <div className="sidebar-tools"><ThemeToggle /><SoundToggle /><SignOutButton compact /></div>
      </div>
    </aside>
    <div className="app-content">
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
    <BotDock stage={stage} organizations={organizations} supportPhone={supportPhone} />
    <FeedbackLayer />
  </div>;
}
