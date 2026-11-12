import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { MyOrg } from "../subscriptions";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured");
  return createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(items: { name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }[]) {
        try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* Server Components cannot modify response cookies. */ }
      }
    }
  });
}

/**
 * The signed-in user for page rendering, from the verified access token. With asymmetric signing
 * keys this is checked locally (no Auth round trip); otherwise supabase-js asks the Auth server,
 * exactly as getUser() does. Writes still go through RLS, which checks the same token.
 */
export async function sessionUser(client: Awaited<ReturnType<typeof createSupabaseServerClient>>): Promise<{ id: string; email: string | undefined } | null> {
  const { data, error } = await client.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string") return null;
  return { id: sub, email: typeof data?.claims?.email === "string" ? data.claims.email : undefined };
}

export type Membership = { organization_id: string; role: string; display_name: string | null; organizations: { name: string; type: string } | null };
/**
 * One session and one read of the person's organizations per request (React cache), shared by the
 * dashboard layout, the page and its parts: membership, role, subscription access, sections and
 * brand colours all come from this single call.
 */
export const requestSession = cache(async () => {
  const client = await createSupabaseServerClient();
  return { client, user: await sessionUser(client) };
});
export const requestMyOrganizations = cache(async (): Promise<{ data: MyOrg[]; error: boolean }> => {
  const { client, user } = await requestSession();
  if (!user) return { data: [], error: false };
  const { data, error } = await client.rpc("my_organizations");
  return { data: (data ?? []) as MyOrg[], error: Boolean(error) };
});
/** Whether the signed-in person runs the platform (one check per request, shared). */
export const requestPlatformAdmin = cache(async (): Promise<boolean> => {
  const { client, user } = await requestSession();
  if (!user) return false;
  const { data } = await client.rpc("am_platform_admin");
  return data === true;
});
/**
 * Unread support threads for the «الدعم» badge, in one call: the person's threads with a reply from
 * the team they have not opened, and for a platform admin the open threads waiting for the team.
 */
export type SupportUnread = { mine: string[]; team: string[] | null };
export const requestSupportUnread = cache(async (): Promise<SupportUnread> => {
  const { client, user } = await requestSession();
  if (!user) return { mine: [], team: null };
  const { data } = await client.rpc("support_unread");
  const value = (data ?? {}) as Partial<SupportUnread>;
  return { mine: value.mine ?? [], team: value.team ?? null };
});
export const requestMemberships = cache(async (): Promise<{ data: Membership[]; error: boolean }> => {
  const { data, error } = await requestMyOrganizations();
  return { data: data.map(org => ({ organization_id: org.organization_id, role: org.role, display_name: org.display_name ?? null, organizations: { name: org.name, type: org.type } })), error };
});
/** Drop-in for auth.getUser() in server actions: reads the verified token instead of calling Auth. */
export async function authUser(client: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const user = await sessionUser(client);
  return { data: { user }, error: user ? null : new Error("No session") };
}
