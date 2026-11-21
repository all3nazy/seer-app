import { notFound } from "next/navigation";
import { requestSession } from "../../../../../../lib/supabase/server";
import { currentAdminRole } from "../../../../../../lib/admin-role";
import { roleAllows } from "../../../../../../lib/admin-roles";
import { isViewSection } from "../../../../../../lib/admin-stage4";
import { AdminNoAccess } from "../../../../../../components/admin-no-access";
import { OrgViewMirror, type OrgViewData } from "../../../../../../components/admin-stage4-views";

export const metadata = { title: "وضع المشاهدة" };

/**
 * «مشاهدة المنصة كأنك هم»: what the organization's owner sees, read through an admin read-only
 * function (no session is impersonated, nothing on this page writes). Owner and support; every view
 * is logged in the organization's log.
 */
export default async function OrgView({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ section?: string }> }) {
  const role = await currentAdminRole();
  if (!roleAllows(role, ["support"])) return <AdminNoAccess role={role} />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const section = (await searchParams).section;
  const { client } = await requestSession();
  const { data } = await client.rpc("admin_org_view", { org: id, p_section: isViewSection(section) ? section : "dashboard" });
  if (!data) notFound();
  return <OrgViewMirror data={data as OrgViewData} />;
}
