import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, requestMemberships, requestSession } from "./supabase/server";
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
/** Deduplicated per request, so a page and its children share one lookup. */
export const loadOrgContext = cache(async function loadOrgContext(requested?: string): Promise<OrgContext | { error: "load" | "none" }> {
  const { client, user } = await requestSession();
  if (!user) redirect("/login");
  const { data: memberships, error: membershipError } = await requestMemberships();
  if (membershipError) return { error: "load" };
  const member = memberships.find(item => item.organization_id === requested) ?? memberships[0];
  if (!member) return { error: "none" };
  const name = (item: (typeof memberships)[number]) => (item.organizations as unknown as { name: string } | null)?.name ?? "منشأة";
  return {
    client, userId: user.id, org: member.organization_id as string, orgName: name(member), role: member.role as string,
    manager: canManage(member.role as string), organizations: memberships.map(item => ({ id: item.organization_id as string, name: name(item) })),
  };
});
