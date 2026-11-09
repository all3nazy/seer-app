"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon, Logo } from "./icons";
import { SoundToggle, ThemeToggle } from "./preferences";
import { FeedbackLayer } from "./feedback";
import SignOutButton from "./sign-out-button";
import { BotDock } from "./bot-dock";
import { BotAvatar } from "./bot-avatar";
import { NotificationBell } from "./notifications";
import { computerOnlySection, matches, navGroupLabels, navLinks, visibleLinks, type NavGroup } from "../lib/navigation";
import { patternUrl, type Stage } from "../lib/stage";
import { featureOf, featureState, type OrgFeatures } from "../lib/subscriptions";

type ShellProps = { children: React.ReactNode; stage: Stage; organizations: { id: string; name: string }[]; supportPhone: string; manager?: boolean; userId?: string;
  sections?: OrgFeatures | null; brand?: { primary: string | null; onPrimary: string | null; accent: string | null } | null;
  notice?: { text: string; owner: boolean; org: string } | null; platformAdmin?: boolean };

export function AppShell({ children, stage, organizations, supportPhone, manager = true, userId, sections = null, brand = null, notice = null, platformAdmin = false }: ShellProps) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("seer-sidebar") === "rail"); } catch { /* storage unavailable */ } }, []);
  const toggle = () => setCollapsed(value => { try { localStorage.setItem("seer-sidebar", value ? "full" : "rail"); } catch { /* ignore */ } return !value; });
  const current = (link: (typeof navLinks)[number]) => matches(link, path) ? "page" as const : undefined;
  const fullOnly = computerOnlySection(path);
  // Sections turned off by the organization are hidden; sections outside the plan show a lock.
  const stateOf = (href: string) => featureState(featureOf(href), sections);
  const tabs = navLinks.filter(link => link.tab && stateOf(link.href) === "on");
  const inMore = !tabs.some(link => matches(link, path));
  const groups = (Object.keys(navGroupLabels) as NavGroup[]).map(group => ({ group, links: visibleLinks(manager).filter(link => link.group === group && stateOf(link.href) !== "off") }));
  const style = { ...(brand?.primary ? { "--primary": brand.primary, "--primary-hover": brand.primary, "--on-primary": brand.onPrimary ?? "#fff" } : {}), ...(brand?.accent ? { "--accent": brand.accent, "--coral": brand.accent } : {}) } as React.CSSProperties;
  const assistantOn = stateOf("/dashboard/assistant") === "on";
  const settings = navLinks.find(link => link.href === "/dashboard/settings")!;
  return <div className={`app stage-${stage}${collapsed ? " is-rail" : ""}`} style={style}>
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
          {links.map(link => stateOf(link.href) === "locked"
            ? <Link key={link.href} className="nav-link is-locked" href={`/dashboard/billing?upgrade=${featureOf(link.href)}`} title={`${link.label}: ضمن الباقة المتقدمة — رقّ باقتك`}>
                <Icon name={link.icon} /><span className="nav-text">{link.label}</span><span className="nav-lock" aria-label="خارج باقتك">🔒</span>
              </Link>
            : <Link key={link.href} className="nav-link" href={link.href} aria-current={current(link)} title={link.label}>
                <Icon name={link.icon} /><span className="nav-text">{link.label}</span>
              </Link>)}
        </div>)}
      </nav>
      <div className="sidebar-foot">
        {platformAdmin ? <Link className="nav-link" href="/admin" title="لوحة مسؤول المنصة"><Icon name="shield" /><span className="nav-text">لوحة المسؤول</span></Link> : null}
        <Link className="nav-link" href="/dashboard/billing" aria-current={path.startsWith("/dashboard/billing") ? "page" : undefined} title="الاشتراك"><Icon name="wallet" /><span className="nav-text">الاشتراك</span></Link>
        <Link className="nav-link" href={settings.href} aria-current={current(settings)} title={collapsed ? settings.label : undefined}><Icon name="settings" /><span className="nav-text">{settings.label}</span></Link>
        <div className="sidebar-tools">{userId ? <NotificationBell userId={userId} /> : null}<ThemeToggle /><SoundToggle /><SignOutButton compact /></div>
      </div>
    </aside>
    <div className="app-content">
      <header className="mobile-bar"><Logo href="/dashboard" label="سِير — لوحة التشغيل" /><div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {organizations.length && assistantOn ? <button type="button" className="bar-bot" onClick={() => window.dispatchEvent(new Event("seer:open-bot"))} aria-label="افتح المساعد"><BotAvatar stage={stage} size={30} mood="idle" /></button> : null}
        {userId ? <NotificationBell userId={userId} /> : null}<ThemeToggle /></div></header>
      <main className={`main${path === "/dashboard" || path === "/dashboard/tasks" ? " wide" : ""}`} id="main-content" tabIndex={-1}>
        {notice ? <div className="renewal-banner" role="status"><span>⏳ {notice.text}</span>{notice.owner
          ? <Link className="btn btn-sm btn-primary" href={`/dashboard/billing?org=${encodeURIComponent(notice.org)}`}>جدّد الاشتراك</Link>
          : <span className="hint">التجديد من صلاحية مالك المنشأة.</span>}</div> : null}
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
    {assistantOn ? <BotDock stage={stage} organizations={organizations} supportPhone={supportPhone} disabled={sections ? [...sections.disabled, ...featureKeysOutside(sections)] : []} /> : null}
    <FeedbackLayer />
  </div>;
}

const allFeatures = ["pickup", "daily", "messages", "announcements", "inquiries", "tasks", "finance", "admissions", "staff", "assistant", "transport", "learning", "payroll", "reports", "online_payments"];
function featureKeysOutside(sections: OrgFeatures): string[] { return allFeatures.filter(key => !sections.features.includes(key)); }
