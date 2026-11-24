"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NotificationBell, onNotification } from "./notifications";
import SignOutButton from "./sign-out-button";
import { seedSupportBadge, supportNotification, useSupportBadge } from "./support-badge";
import { activeAdminItem, adminNavFor, type AdminNavItem } from "../lib/admin-nav";
import { adminRoleLabels, type AdminRole } from "../lib/admin-roles";
import { arNumber } from "../lib/dates";

type Counts = { payments: number; support: number; requests: number; inbox?: number };

/**
 * «سِير أدمن» (approved design): the Seer identity with a dark plum sidebar, a coral «أدمن» pill and
 * a coral active item. On phones the sidebar folds into a menu button at the top.
 */
export function AdminShell({ children, userId, appUrl, counts, support, role = "owner" }: { children: React.ReactNode; userId: string; appUrl: string; counts: Counts; support: string[]; role?: AdminRole }) {
  const path = usePathname();
  const active = activeAdminItem(path);
  const [open, setOpen] = useState(false);
  // The support count follows new tickets live (same channel as the bell).
  seedSupportBadge([], support);
  const badge = useSupportBadge();
  useEffect(() => onNotification(supportNotification), []);
  useEffect(() => { setOpen(false); }, [path]);
  const live: Counts = { ...counts, support: badge.team ?? counts.support };
  const count = (item: AdminNavItem) => item.count ? live[item.count] ?? 0 : 0;
  return <div className="adm">
    <a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a>
    <aside className={`adm-side${open ? " is-open" : ""}`}>
      <div className="adm-brand-row">
        <Link className="adm-brand" href="/admin" aria-label="سِير أدمن — نظرة عامة">
          <span className="adm-logo">سِير<span className="adm-dot" aria-hidden="true" /></span>
          <span className="adm-pill">أدمن</span>
        </Link>
        <button type="button" className="adm-menu-btn" aria-expanded={open} aria-controls="admin-nav" onClick={() => setOpen(value => !value)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">{open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
          {open ? "إغلاق" : "القائمة"}
        </button>
      </div>
      <p className="adm-sub">{role === "owner" ? "لوحة مالك المنصة" : `فريق الإدارة · ${adminRoleLabels[role]}`}</p>
      <nav id="admin-nav" aria-label="أقسام لوحة المالك" className="adm-nav">
        {adminNavFor(role).map((group, index) => <div key={index} className="adm-group">
          {group.title ? <p className="adm-group-title">{group.title}</p> : null}
          {group.items.map(item => {
            const n = count(item);
            const current = active === item.href;
            return <Link key={item.href} href={item.href} className="adm-link" aria-current={current ? "page" : undefined}>
              <span>{item.label}</span>
              {n ? <span className="adm-count" aria-label={`${arNumber(n)} بانتظارك`}>{n > 99 ? "99+" : arNumber(n)}</span> : null}
            </Link>;
          })}
        </div>)}
      </nav>
    </aside>
    <div className="adm-body">
      <div className="adm-top">
        <span className="adm-mfa"><span aria-hidden="true" className="adm-mfa-dot" />دخول بالتحقق الثنائي</span>
        <span className="adm-top-actions">
          <NotificationBell userId={userId} scope="admin" />
          <a className="btn btn-sm" href={`${appUrl}/`} rel="noopener">فتح المنصة</a>
          <SignOutButton to="/admin/login" />
        </span>
      </div>
      <main className="main adm-main" id="main-content" tabIndex={-1}>{children}</main>
    </div>
  </div>;
}
