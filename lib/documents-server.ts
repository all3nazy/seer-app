import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyProfile, profileColumns, type OrgProfile } from "./documents";

/** The organization's document identity, or defaults when it has not been set yet. */
export async function loadProfile(client: SupabaseClient, org: string, name: string): Promise<OrgProfile> {
  const { data } = await client.from("organization_profiles").select(profileColumns).eq("organization_id", org).maybeSingle();
  return data ? { ...emptyProfile(name), ...(data as unknown as Partial<OrgProfile>), name } : emptyProfile(name);
}
