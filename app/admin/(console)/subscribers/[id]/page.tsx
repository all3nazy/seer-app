import { notFound } from "next/navigation";
import { requestSession } from "../../../../../lib/supabase/server";
import { OrgProfileView, type OrgProfile } from "../../../../../components/admin-org-profile";
import type { InvoiceRow } from "../../../../../components/admin-stage3-views";
import { currentAdminRole } from "../../../../../lib/admin-role";
import { roleAllows } from "../../../../../lib/admin-roles";

export const metadata = { title: "ملف منشأة" };

/** «ملف منشأة»: everything about one organization, with the platform team's actions (all audited). */
export default async function AdminSubscriber({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { client } = await requestSession();
  const role = await currentAdminRole();
  const finance = roleAllows(role, ["finance"]);
  const [profileResult, plans, invoices] = await Promise.all([client.rpc("admin_org_profile", { org: id }), client.from("plans").select("id,name").order("sort_order"),
    finance ? client.rpc("admin_invoices", { p_org: id }) : Promise.resolve({ data: null, error: null })]);
  const profile = profileResult.data as OrgProfile | null;
  if (!profile) notFound();
  // Receipts are private: short-lived links, made on the server.
  const receipts: Record<string, string | null> = {};
  await Promise.all(profile.payments.slice(0, 30).map(async payment => {
    receipts[payment.id] = await client.storage.from("subscription-receipts").createSignedUrl(payment.receipt_path, 600).then(result => result.data?.signedUrl ?? null).catch(() => null);
  }));
  return <OrgProfileView profile={profile} plans={(plans.data ?? []) as { id: string; name: string }[]} receipts={receipts} role={role} invoices={finance ? ((invoices.error ? [] : invoices.data ?? []) as InvoiceRow[]) : null} />;
}
