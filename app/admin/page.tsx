import Link from "next/link";
import { requestSession } from "../../lib/supabase/server";
import { riyal } from "../../lib/subscriptions";

export const metadata = { title: "نظرة عامة" };
type Overview = { mrr: number; active: number; trial: number; grace: number; locked: number; expiring: number; pending: number };
type Row = { organization_id: string; name: string; plan: string | null; status: string | null; access: string; ends_on: string | null; days_left: number | null; owner_phone: string | null };

export default async function AdminHome() {
  const { client } = await requestSession();
  const [overview, subscribers] = await Promise.all([client.rpc("admin_overview"), client.rpc("admin_subscribers", { search: null, filter: null })]);
  const o = (overview.data ?? { mrr: 0, active: 0, trial: 0, grace: 0, locked: 0, expiring: 0, pending: 0 }) as Overview;
  const expiring = ((subscribers.data ?? []) as Row[]).filter(row => row.days_left !== null && row.days_left >= 0 && row.days_left <= 14 && row.status !== "suspended");
  const n = (value: number) => Number(value).toLocaleString("ar-SA");
  return <>
    <header className="page-head"><div><h1>لوحة المسؤول</h1><p>صورة الاشتراكات الآن.</p></div></header>
    <div className="stats admin-stats">
      <div className="stat sky"><span className="figure">{riyal(o.mrr)}</span><span className="label">الإيراد الشهري المتكرر</span></div>
      <div className="stat"><span className="figure">{n(o.active)}</span><span className="label">مشتركين نشطين</span></div>
      <div className="stat"><span className="figure">{n(o.trial)}</span><span className="label">في التجربة</span></div>
      <div className="stat peach"><span className="figure">{n(o.grace)}</span><span className="label">في المهلة</span></div>
      <div className="stat peach"><span className="figure">{n(o.locked)}</span><span className="label">مقفلين</span></div>
      <Link className="stat" href="/admin/payments"><span className="figure">{n(o.pending)}</span><span className="label">تحويلات معلّقة</span></Link>
    </div>
    <section className="card" style={{ marginTop: 16 }}><h2>تنتهي خلال ١٤ يوم ({n(expiring.length)})</h2>
      {expiring.length ? <ul className="records">{expiring.map(row => <li key={row.organization_id}><Link href={`/admin/subscribers/${row.organization_id}`}>{row.name}</Link>
        <span className="hint">{row.plan} · باقي {n(row.days_left ?? 0)} يوم{row.owner_phone ? ` · ${row.owner_phone}` : ""}</span></li>)}</ul> : <p className="empty">ما فيه اشتراكات تنتهي قريبًا.</p>}
    </section>
  </>;
}
