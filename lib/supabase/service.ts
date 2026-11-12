import { createClient } from "@supabase/supabase-js";

/** A server-only client with the service role, for scheduled jobs and webhooks (never in the browser). */
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
