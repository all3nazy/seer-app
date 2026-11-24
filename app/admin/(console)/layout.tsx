import { redirect } from "next/navigation";
import { requestSession } from "../../../lib/supabase/server";
import { AdminShell } from "../../../components/admin-shell";
import { FeedbackLayer } from "../../../components/feedback";
import { appBase } from "../../../lib/surface";
import { adminGate } from "../../../lib/admin-gate";
import { currentAdminRole } from "../../../lib/admin-role";

export const dynamic = "force-dynamic";

/**
 * The platform console. Only for a platform admin who passed two-step verification (aal2): checked
 * here, in the middleware, and again by every database function (private.is_platform_admin()).
 * Anyone else goes back to the admin sign-in (or to the verification step after the password).
 */
export default async function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  const { client, user } = await requestSession();
  const { data: claims } = user ? await client.auth.getClaims() : { data: null };
  const admin = user && claims?.claims?.aal === "aal2" ? (await client.rpc("am_platform_admin")).data === true : false;
  const gate = adminGate({ signedIn: Boolean(user), aal: claims?.claims?.aal, admin });
  if (gate !== "allow") redirect(gate);
  // Counts for the sidebar (each is optional: the page still works if one fails).
  const [role, overview, unread, requests, inbox] = await Promise.all([
    currentAdminRole(),
    client.rpc("admin_overview"),
    client.rpc("support_unread"),
    client.rpc("admin_join_requests"),
    client.rpc("admin_inbox_unread"),
  ]);
  const counts = {
    payments: Number((overview.data as { pending?: number } | null)?.pending ?? 0),
    support: ((unread.data as { team?: string[] | null } | null)?.team ?? []).length,
    requests: ((requests.data ?? []) as { status: string }[]).filter(row => row.status === "new").length,
    inbox: Number(inbox.data ?? 0),
  };
  return <AdminShell userId={user!.id} appUrl={appBase()} role={role} counts={counts} support={(unread.data as { team?: string[] | null } | null)?.team ?? []}>
    {children}
    <FeedbackLayer />
  </AdminShell>;
}
