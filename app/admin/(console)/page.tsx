import { requestSession } from "../../../lib/supabase/server";
import { serviceClient } from "../../../lib/supabase/service";
import { LoginSecurityCard } from "../../../components/login-security";
import { OverviewView, type HealthExtra, type OverviewData, type PendingTransfer } from "../../../components/admin-overview";
import { botInfo } from "../../../lib/telegram-status";
import { currentAdminRole } from "../../../lib/admin-role";

export const metadata = { title: "نظرة عامة" };

const empty: OverviewData = {
  decisions: { payments: 0, oldest_payment: null, join_requests: 0, support_waiting: 0, support_over_24h: 0, ending_7_days: 0 },
  numbers: { active: 0, trial: 0, trial_ending_7_days: 0, mrr: 0, renewal_base: 0, renewal_rate: null, signed_in_today: 0, users: 0 },
  health: { database: false, cron: [], telegram_links: 0, telegram_failed_today: 0 }, activity: [],
};

/** «نظرة عامة»: real data only (admin_overview_v2), the pending transfers, and the platform's health. */
export default async function AdminHome() {
  const { client } = await requestSession();
  const service = serviceClient();
  const role = await currentAdminRole();
  const [overview, pending, security, bot] = await Promise.all([
    client.rpc("admin_overview_v2"),
    client.rpc("admin_pending_payments"),
    service ? service.rpc("login_security_summary") : Promise.resolve({ data: null, error: true }),
    botInfo().catch(() => null),
  ]);
  const data = (overview.data ?? empty) as OverviewData;
  const locks = (security.data as { locks?: { active: boolean }[] } | null)?.locks;
  const extra: HealthExtra = {
    locks24h: locks ? locks.length : null,
    activeLocks: locks ? locks.filter(lock => lock.active).length : null,
    telegram: !bot?.configured ? "off" : bot.webhook?.lastError ? "error" : !bot.webhook ? "error" : data.health.telegram_links ? "ok" : "unlinked",
  };
  return <>
    <OverviewView data={data} pending={(pending.data ?? []) as PendingTransfer[]} extra={extra} role={role} />
    {role === "owner" ? <LoginSecurityCard /> : null}
  </>;
}
