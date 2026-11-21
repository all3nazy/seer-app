import { notFound } from "next/navigation";
import { AdminShell } from "../../../components/admin-shell";
import { OrgProfileView } from "../../../components/admin-org-profile";
import { fixtureNow, sampleProfile } from "../../../lib/e2e-admin-fixtures";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Browser-test page: an organization profile with sample data. Only when SEER_E2E=1. */
export default function Page() {
  if (process.env.SEER_E2E !== "1") notFound();
  return <AdminShell userId="00000000-0000-0000-0000-0000000000e2" appUrl="http://127.0.0.1:3100" counts={{ payments: 0, support: 0, requests: 0 }} support={[]}>
    <OrgProfileView profile={sampleProfile} plans={[{ id: "b1000000-0000-0000-0000-000000000001", name: "المتقدمة" }, { id: "b1000000-0000-0000-0000-000000000002", name: "الأساسية" }]} receipts={{ "c1000000-0000-0000-0000-000000000001": "#receipt" }} now={fixtureNow} />
  </AdminShell>;
}
