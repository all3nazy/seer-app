import { AppShell } from "../../components/app-shell";
import { requestMemberships, requestSession } from "../../lib/supabase/server";
import { stageOf } from "../../lib/stage";

/** Loads the member's organizations once for the shell: stage look, and the bot's organization list. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [{ data }, { user }] = await Promise.all([requestMemberships(), requestSession()]);
  const organizations = (data ?? []).map(row => {
    const org = row.organizations as unknown as { name: string; type: string } | null;
    return { id: row.organization_id as string, name: org?.name ?? "منشأة", type: org?.type ?? "school", manager: row.role === "owner" || row.role === "admin" };
  });
  return <AppShell stage={stageOf(organizations[0]?.type)} organizations={organizations.map(({ id, name }) => ({ id, name }))} supportPhone={process.env.SEER_SUPPORT_WHATSAPP ?? ""} manager={organizations.some(org => org.manager)} userId={user?.id}>
    {children}
  </AppShell>;
}
