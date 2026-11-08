import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseMoyasarEvent, type Settlement } from "../../../../../lib/payment-gateways";

export const dynamic = "force-dynamic";

/**
 * Gateway → platform notifications. The database settles the attempt only when the event carries
 * the webhook secret of the school that owns the payment, in SAR and in live mode; anything else is
 * refused or held for review. Needs SUPABASE_SERVICE_ROLE_KEY in the server environment.
 */
const statusFor: Record<string, number> = { recorded: 200, already: 200, failed: 200, test: 200, needs_review: 200, unauthorized: 401, not_found: 404, not_live: 409 };
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Gateway not configured" }, { status: 501 });
  if (provider !== "moyasar") return NextResponse.json({ error: "Gateway not supported yet" }, { status: 501 });
  const raw = await request.text();
  if (raw.length > 20000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let settlement: Settlement | null = null;
  try { settlement = parseMoyasarEvent(JSON.parse(raw)); } catch { settlement = null; }
  if (!settlement) return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("settle_online_payment", {
    intent: settlement.intent, ref: settlement.ref, paid_amount: settlement.amount, currency: settlement.currency,
    live: settlement.live, succeeded: settlement.succeeded, reason: settlement.reason, token_hash: settlement.tokenHash,
  });
  if (error) return NextResponse.json({ error: "Could not settle" }, { status: 500 });
  const outcome = String(data);
  return NextResponse.json({ outcome }, { status: statusFor[outcome] ?? 500 });
}
