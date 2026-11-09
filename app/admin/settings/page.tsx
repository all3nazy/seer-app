import { requestSession } from "../../../lib/supabase/server";
import { SettingsForm } from "../../../components/admin-forms";

export const metadata = { title: "إعدادات الدفع" };
const actions: Record<string, string> = { plan_created: "إضافة باقة", plan_updated: "تعديل باقة", duration_updated: "تعديل خصم مدة", settings_updated: "تعديل إعدادات الدفع" };

export default async function AdminSettings() {
  const { client } = await requestSession();
  const [settings, audit] = await Promise.all([client.from("platform_settings").select("bank_accounts,trial_days,grace_days,lock_family_links").maybeSingle(), client.rpc("admin_audit")]);
  const value = (settings.data ?? { bank_accounts: [], trial_days: 14, grace_days: 7, lock_family_links: true }) as { bank_accounts: { bank: string; holder: string; iban: string }[]; trial_days: number; grace_days: number; lock_family_links: boolean };
  return <>
    <header className="page-head"><div><h1>إعدادات الدفع والاشتراك</h1><p>الحسابات البنكية تظهر للمشترك في صفحة التجديد.</p></div></header>
    <section className="card"><SettingsForm settings={value} /></section>
    <section className="card" style={{ marginTop: 16 }}><h2>سجل تعديلات المنصة</h2>
      <ul className="records">{((audit.data ?? []) as { action: string; detail: Record<string, unknown>; created_at: string }[]).map((row, index) => <li key={index}><span>{actions[row.action] ?? row.action}{row.detail?.name ? `: ${String(row.detail.name)}` : ""}</span><span className="hint">{new Date(row.created_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</span></li>)}</ul>
    </section>
  </>;
}
