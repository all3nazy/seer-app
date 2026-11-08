import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

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
 * One session and one memberships read per request, shared by the layout, the page and its parts
 * (React cache). Saves repeated token checks and membership queries on every navigation.
 */
export const requestSession = cache(async () => {
  const client = await createSupabaseServerClient();
  return { client, user: await sessionUser(client) };
});
export const requestMemberships = cache(async (): Promise<{ data: Membership[]; error: boolean }> => {
  const { client, user } = await requestSession();
  if (!user) return { data: [], error: false };
  const { data, error } = await client.from("memberships").select("organization_id,role,display_name,organizations(name,type)").eq("user_id", user.id);
  return { data: (data ?? []) as unknown as Membership[], error: Boolean(error) };
});
/** Drop-in for auth.getUser() in server actions: reads the verified token instead of calling Auth. */
export async function authUser(client: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const user = await sessionUser(client);
  return { data: { user }, error: user ? null : new Error("No session") };
}
