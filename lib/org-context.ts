import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";
import { canManage } from "./operations";

export type OrgChoice = { id: string; name: string };
export type OrgContext = {
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
  org: string;
  orgName: string;
  role: string;
  manager: boolean;
  organizations: OrgChoice[];
};

/** Signed-in user and the organization they chose (or their first one). Redirects to login without a session. */
export async function loadOrgContext(requested?: string): Promise<OrgContext | { error: "load" | "none" }> {
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect("/login");
  const { data, error: membershipError } = await client.from("memberships").select("organization_id,role,organizations(name)").eq("user_id", user.id);
  if (membershipError) return { error: "load" };
  const memberships = data ?? [];
  const member = memberships.find(item => item.organization_id === requested) ?? memberships[0];
  if (!member) return { error: "none" };
  const name = (item: (typeof memberships)[number]) => (item.organizations as unknown as { name: string } | null)?.name ?? "منشأة";
  return {
    client, userId: user.id, org: member.organization_id as string, orgName: name(member), role: member.role as string,
    manager: canManage(member.role as string), organizations: memberships.map(item => ({ id: item.organization_id as string, name: name(item) })),
  };
}
