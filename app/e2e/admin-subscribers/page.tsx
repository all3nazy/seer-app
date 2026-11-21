import { notFound } from "next/navigation";
import { AdminShell } from "../../../components/admin-shell";
import { SubscribersView } from "../../../components/admin-subscribers";
import { sampleRows } from "../../../lib/e2e-admin-fixtures";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Browser-test page: the subscribers list with sample rows (page 2 of 3). Only when SEER_E2E=1. */
export default async function Page({ searchParams }: { searchParams: Promise<{ none?: string }> }) {
  if (process.env.SEER_E2E !== "1") notFound();
  const none = (await searchParams).none === "1";
  return <AdminShell userId="00000000-0000-0000-0000-0000000000e2" appUrl="http://127.0.0.1:3100" counts={{ payments: 0, support: 0, requests: 0 }} support={[]}>
    <SubscribersView rows={none ? [] : sampleRows} plans={[{ id: "b1000000-0000-0000-0000-000000000001", name: "المتقدمة" }]} query={{ q: none ? "لا يوجد" : "الرياض", status: "", plan: "", ending: false, sort: "ending", page: 2 }} setup={new Map()} />
  </AdminShell>;
}
