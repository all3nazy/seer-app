import { notFound } from "next/navigation";
import { AdminShell } from "../../../components/admin-shell";
import { BackupsView, HealthView, OrgViewMirror, type OrgViewData } from "../../../components/admin-stage4-views";
import { isAdminRole } from "../../../lib/admin-roles";
import { fixtureNow, sampleBackups, sampleHealth, sampleOrgView } from "../../../lib/e2e-admin-fixtures";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Browser-test page for «سِير أدمن» stage 4 views with sample data (?view=backups|health|view&section=…). Only when SEER_E2E=1. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.SEER_E2E !== "1") notFound();
  const params = await searchParams;
  const role = isAdminRole(params.role) ? params.role : "owner";
  const view = params.view === "health"
    ? <HealthView data={sampleHealth} site={{ app: "https://seersa.vercel.app", admin: "https://seersa-admin.vercel.app" }} links={{ supabase: "https://supabase.com/dashboard/project/vhcdzonkgalpcozbhmmj", vercel: "https://vercel.com/dashboard" }} now={fixtureNow} />
    : params.view === "view" ? <OrgViewMirror data={sampleOrgView(params.section ?? "dashboard") as OrgViewData} />
    : <BackupsView runs={params.empty ? [] : sampleBackups} now={fixtureNow} />;
  return <AdminShell userId="00000000-0000-0000-0000-0000000000e2" appUrl="http://127.0.0.1:3100" counts={{ payments: 0, support: 0, requests: 0 }} support={[]} role={role}>{view}</AdminShell>;
}
