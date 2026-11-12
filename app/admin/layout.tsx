import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requestSession } from "../../lib/supabase/server";
import { Logo } from "../../components/icons";
import { FeedbackLayer } from "../../components/feedback";
import { NotificationBell } from "../../components/notifications";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "لوحة المسؤول", template: "%s | لوحة المسؤول" }, robots: { index: false, follow: false } };

/** The platform console: only for platform admins, checked here and again by every database function. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { client, user } = await requestSession();
  if (!user) redirect("/login");
  const { data } = await client.rpc("am_platform_admin");
  if (data !== true) notFound();
  return <div className="admin-shell">
    <header className="admin-bar">
      <Logo href="/admin" label="سِير — لوحة المسؤول" />
      <nav aria-label="لوحة المسؤول" className="admin-nav">
        <Link href="/admin">نظرة عامة</Link><Link href="/admin/support">الدعم</Link><Link href="/admin/payments">التحويلات</Link><Link href="/admin/subscribers">المشتركين</Link>
        <Link href="/admin/plans">الباقات والأسعار</Link><Link href="/admin/settings">إعدادات الدفع</Link>
      </nav>
      <span style={{ display: "flex", gap: 10, alignItems: "center" }}><NotificationBell userId={user.id} /><Link className="admin-back" href="/dashboard"><svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="18" height="18"><path d="M5 12h14M13 6l6 6-6 6" /></svg>رجوع للمنصة</Link></span>
    </header>
    <main className="main" id="main-content">{children}</main>
    <FeedbackLayer />
  </div>;
}
