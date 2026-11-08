import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWith, type Outgoing } from "../../../../lib/message-dispatch";
import { sameSecret } from "../../../../lib/payment-gateways";

export const dynamic = "force-dynamic";

/**
 * Sends queued messages for schools that chose a provider. Call it from a scheduler (Vercel Cron,
 * Supabase pg_cron or any uptime pinger) with "Authorization: Bearer <CRON_SECRET>".
 * Manual-mode schools are skipped; their messages are sent by staff from the outbox page.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET, url = process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !url || !serviceKey) return NextResponse.json({ error: "Dispatcher not configured" }, { status: 501 });
  if (!sameSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: batch, error } = await admin.rpc("claim_messages", { batch: 50 });
  if (error) return NextResponse.json({ error: "Could not claim" }, { status: 500 });
  const messages = (batch ?? []) as (Outgoing & { organization_id: string })[];
  const orgs = [...new Set(messages.map(message => message.organization_id))];
  const { data: settings } = orgs.length ? await admin.from("message_settings").select("organization_id,provider,sender_name").in("organization_id", orgs) : { data: [] };
  const byOrg = new Map(((settings ?? []) as { organization_id: string; provider: string; sender_name: string | null }[]).map(row => [row.organization_id, row]));
  let sent = 0;
  for (const message of messages) {
    const config = byOrg.get(message.organization_id);
    const result = config ? await sendWith(config.provider, message, config.sender_name) : { ok: false as const, error: "no settings" };
    await admin.rpc("report_message", { message: message.id, ok: result.ok, ref: result.ok ? result.ref : null, error: result.ok ? null : result.error });
    if (result.ok) sent += 1;
  }
  return NextResponse.json({ claimed: messages.length, sent });
}
