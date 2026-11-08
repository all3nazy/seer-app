"use server";
import { createSupabaseServerClient } from "../../lib/supabase/server";

/** The receiver confirms a pickup by typing their ID number. */
export async function confirmPickup(_: { result?: string }, data: FormData): Promise<{ result?: string }> {
  const token = String(data.get("token") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { result: "not_found" };
  const client = await createSupabaseServerClient();
  const { data: result, error } = await client.rpc("confirm_pickup", { token, national_id: String(data.get("national_id") ?? "") });
  return { result: error ? "error" : String(result) };
}
