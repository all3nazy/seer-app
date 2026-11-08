import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyProfile, profileColumns, type OrgProfile } from "./documents";

/** The organization's document identity, or defaults when it has not been set yet. */
export async function loadProfile(client: SupabaseClient, org: string, name: string): Promise<OrgProfile> {
  const { data } = await client.from("organization_profiles").select(profileColumns).eq("organization_id", org).maybeSingle();
  return data ? { ...emptyProfile(name), ...(data as unknown as Partial<OrgProfile>), name } : emptyProfile(name);
}

/** A short /s/CODE link for a private page (/d, /p or /c); falls back to the long link if it cannot be made. */
export async function shortLink(client: Awaited<ReturnType<typeof import("./supabase/server").createSupabaseServerClient>>, origin: string, path: string): Promise<string> {
  const { data, error } = await client.rpc("short_code", { target: path });
  return !error && typeof data === "string" ? `${origin}/s/${data}` : `${origin}${path}`;
}
