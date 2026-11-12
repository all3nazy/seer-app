import { requestSession } from "../../../lib/supabase/server";
import { SettingsForm } from "../../../components/admin-forms";
import { TelegramSettings, type BotInfo, type TelegramState } from "../../../components/telegram-settings";
import { telegramApi } from "../../../lib/telegram";

/** The bot's name and webhook state, read with the token on the server (the token never leaves it). */
async function botInfo(): Promise<BotInfo> {
  const configured = Boolean(process.env.TELEGRAM_BOT_TOKEN), secret = Boolean(process.env.TELEGRAM_WEBHOOK_SECRET);
  if (!configured) return { configured, secret, username: null, webhook: null };
  const [me, hook] = await Promise.all([telegramApi("getMe", {}), telegramApi("getWebhookInfo", {})]);
  const info = hook.result as { url?: string; pending_update_count?: number; last_error_message?: string } | undefined;
  return { configured, secret, username: (me.result as { username?: string } | undefined)?.username ?? null,
    webhook: info?.url ? { url: info.url, pending: info.pending_update_count ?? 0, lastError: info.last_error_message ?? null } : null };
}

export const metadata = { title: "إعدادات الدفع" };
const actions: Record<string, string> = { telegram_link_code: "رمز ربط تيليقرام", telegram_linked: "ربط تيليقرام", telegram_unlinked: "فك ربط تيليقرام", join_request_invite: "دعوة من طلب انضمام", join_request_reject: "رفض طلب انضمام", org_invite_created: "إنشاء دعوة منشأة", org_invite_revoked: "إلغاء دعوة منشأة", org_invite_reissued: "رابط دعوة جديد", org_invite_used: "تفعيل منشأة بدعوة", plan_created: "إضافة باقة", plan_updated: "تعديل باقة", duration_updated: "تعديل خصم مدة", settings_updated: "تعديل إعدادات الدفع" };

export default async function AdminSettings() {
  const { client } = await requestSession();
  const [settings, audit, telegram, bot] = await Promise.all([client.from("platform_settings").select("bank_accounts,trial_days,grace_days,lock_family_links").maybeSingle(), client.rpc("admin_audit"), client.rpc("telegram_status"), botInfo()]);
  const value = (settings.data ?? { bank_accounts: [], trial_days: 14, grace_days: 7, lock_family_links: true }) as { bank_accounts: { bank: string; holder: string; iban: string }[]; trial_days: number; grace_days: number; lock_family_links: boolean };
  return <>
    <header className="page-head"><div><h1>إعدادات الدفع والاشتراك</h1><p>الحسابات البنكية تظهر للمشترك في صفحة التجديد.</p></div></header>
    <section className="card"><SettingsForm settings={value} /></section>
    <section className="card" style={{ marginTop: 16 }} aria-labelledby="telegram-title" id="telegram"><h2 id="telegram-title">تيليقرام</h2>
      <TelegramSettings state={(telegram.data ?? null) as TelegramState | null} bot={bot} /></section>
    <section className="card" style={{ marginTop: 16 }}><h2>سجل تعديلات المنصة</h2>
      <ul className="records">{((audit.data ?? []) as { action: string; detail: Record<string, unknown>; created_at: string }[]).map((row, index) => <li key={index}><span>{actions[row.action] ?? row.action}{row.detail?.name ? `: ${String(row.detail.name)}` : ""}</span><span className="hint">{new Date(row.created_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</span></li>)}</ul>
    </section>
  </>;
}
