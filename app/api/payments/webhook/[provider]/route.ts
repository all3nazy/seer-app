import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyMoyasarEvent, type Settlement } from "../../../../../lib/payment-gateways";

export const dynamic = "force-dynamic";

/**
 * Gateway → platform notifications. A verified event settles the attempt through a database
 * function only the service role can run; the payment then appears in the ledger with a receipt.
 * Needs SUPABASE_SERVICE_ROLE_KEY and the gateway's webhook secret in the server environment.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let settlement: Settlement | null = null;
  if (provider === "moyasar") {
    const secret = process.env.MOYASAR_WEBHOOK_SECRET ?? "";
    if (!secret || !url || !serviceKey) return NextResponse.json({ error: "Gateway not configured" }, { status: 501 });
    const body = await request.json().catch(() => null);
    settlement = body ? verifyMoyasarEvent(body, secret) : null;
  } else {
    return NextResponse.json({ error: "Gateway not supported yet" }, { status: 501 });
  }
  if (!settlement) return NextResponse.json({ error: "Invalid event" }, { status: 401 });
  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  const { error } = await admin.rpc("settle_online_payment", { intent: settlement.intent, ref: settlement.ref, paid_amount: settlement.amount, succeeded: settlement.succeeded, reason: settlement.reason });
  if (error) return NextResponse.json({ error: "Could not settle" }, { status: error.code === "23514" ? 409 : 500 });
  return NextResponse.json({ ok: true });
}
