import { notFound } from "next/navigation";
import { AdminShell } from "../../../components/admin-shell";
import { OverviewView } from "../../../components/admin-overview";
import { fixtureNow, sampleOverview, samplePending } from "../../../lib/e2e-admin-fixtures";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Browser-test page: the overview with sample data. Only when SEER_E2E=1. */
export default async function Page({ searchParams }: { searchParams: Promise<{ empty?: string }> }) {
  if (process.env.SEER_E2E !== "1") notFound();
  const empty = (await searchParams).empty === "1";
  const data = empty ? { ...sampleOverview, decisions: { payments: 0, oldest_payment: null, join_requests: 0, support_waiting: 0, support_over_24h: 0, ending_7_days: 0 }, activity: [] } : sampleOverview;
  return <AdminShell userId="00000000-0000-0000-0000-0000000000e2" appUrl="http://127.0.0.1:3100" counts={{ payments: 3, support: 4, requests: 2 }} support={[]}>
    <OverviewView data={data} pending={empty ? [] : samplePending} extra={{ locks24h: 2, activeLocks: 1, telegram: "ok" }} now={fixtureNow} />
  </AdminShell>;
}
