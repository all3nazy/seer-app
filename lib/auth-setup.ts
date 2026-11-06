import type { SupabaseClient } from "@supabase/supabase-js";

/** Invitations can use implicit tokens even though the SSR client defaults to PKCE.
 * Remove callback tokens before initializing the client, then verify with Auth.
 */
export async function verifySetupSession(
  createClient: () => Pick<SupabaseClient, "auth">,
  url: URL,
  clearCallback: (path: string) => void,
): Promise<boolean> {
  const fragment = new URLSearchParams(url.hash.slice(1));
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  const hasCallback = fragment.has("access_token") || fragment.has("refresh_token") || fragment.has("error") || fragment.has("error_code");
  if (hasCallback) {
    clearCallback(url.pathname + url.search);
    if (fragment.has("error") || fragment.has("error_code") || !accessToken || !refreshToken) return false;
  }
  const client = createClient();
  if (accessToken && refreshToken) {
    const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) return false;
  }
  const { data: { user }, error } = await client.auth.getUser();
  return !error && Boolean(user);
}
