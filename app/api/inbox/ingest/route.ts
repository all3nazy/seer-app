import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "../../../../lib/supabase/service";
import { sameSecret } from "../../../../lib/payment-gateways";
import { inboxBatch } from "../../../../lib/inbox";

export const dynamic = "force-dynamic";

/**
 * New emails from the Seer Gmail inbox, posted by the Apps Script in scripts/gmail-inbox-bridge.gs
 * with "Authorization: Bearer <SEER_INBOX_SECRET>". The database skips messages it already has.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.SEER_INBOX_SECRET;
  if (!secret || secret.length < 32 || !sameSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = serviceClient();
  if (!client) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (Number(request.headers.get("content-length") ?? 0) > 3_000_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const messages = inboxBatch(await request.json().catch(() => null));
  if (!messages) return NextResponse.json({ error: "Bad batch" }, { status: 400 });
  if (!messages.length) return NextResponse.json({ ok: true, stored: 0 });
  const { data, error } = await client.rpc("inbox_ingest", { messages });
  if (error) { console.error("inbox ingest: the database refused the batch"); return NextResponse.json({ error: "Could not store" }, { status: 500 }); }
  return NextResponse.json({ ok: true, stored: data ?? 0 });
}
