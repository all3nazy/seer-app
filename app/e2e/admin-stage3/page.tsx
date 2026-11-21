import { notFound } from "next/navigation";
import { AdminShell } from "../../../components/admin-shell";
import { AuditView, BroadcastView, CouponsView, InvoiceDocument, InvoicesView, OrgInvoices, SecurityView, TeamView } from "../../../components/admin-stage3-views";
import { AdminNoAccess } from "../../../components/admin-no-access";
import { OverviewView } from "../../../components/admin-overview";
import { isAdminRole } from "../../../lib/admin-roles";
import { auditQuery } from "../../../lib/admin-stage3";
import { fixtureNow, orgId, sampleAudit, sampleBroadcasts, sampleCouponUses, sampleCoupons, sampleInvoiceDoc, sampleInvoices, sampleOverview, samplePending, sampleSecurity, sampleTeam, stagePlans } from "../../../lib/e2e-admin-fixtures";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Browser-test page for «سِير أدمن» stage 3 views with sample data (?view=…&role=…). Only when SEER_E2E=1. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.SEER_E2E !== "1") notFound();
  const params = await searchParams;
  const role = isAdminRole(params.role) ? params.role : "owner";
  const orgs = [{ id: orgId, name: "روضة الياسمين" }, { id: "d2000000-0000-0000-0000-0000000000d2", name: "مدارس النخيل" }, { id: "d2000000-0000-0000-0000-0000000000d3", name: "حضانة الفجر" }];
  const view = (() => {
    switch (params.view) {
      case "coupons": return <CouponsView coupons={sampleCoupons} plans={stagePlans} today="2026-11-22" selected={params.coupon} uses={sampleCouponUses} />;
      case "invoices": return <InvoicesView rows={sampleInvoices} query={{ q: "", kind: "" }} page={1} />;
      case "invoice": return <InvoiceDocument doc={sampleInvoiceDoc} />;
      case "org-invoices": return <OrgInvoices org={orgId} orgName="روضة الياسمين" rows={sampleInvoices} canIssue />;
      case "broadcast": return <BroadcastView history={sampleBroadcasts} plans={stagePlans} orgs={orgs} now={fixtureNow} />;
      case "security": return <SecurityView data={sampleSecurity} blockIp={params.block ?? ""} />;
      case "audit": return <AuditView rows={sampleAudit} query={auditQuery({})} filters={{ actors: [{ id: "60000000-0000-0000-0000-0000000000ad", email: "admin@seer.test" }], actions: ["coupon_created", "org_extended"] }} orgs={orgs} />;
      case "team": return <TeamView team={sampleTeam} now={fixtureNow} />;
      case "no-access": return <AdminNoAccess role={role} />;
      default: return <OverviewView data={sampleOverview} pending={samplePending} extra={{ locks24h: 2, activeLocks: 1, telegram: "ok" }} now={fixtureNow} role={role} />;
    }
  })();
  return <AdminShell userId="00000000-0000-0000-0000-0000000000e2" appUrl="http://127.0.0.1:3100" counts={{ payments: 2, support: 1, requests: 1 }} support={[]} role={role}>{view}</AdminShell>;
}
