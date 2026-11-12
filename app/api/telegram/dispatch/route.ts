import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "../../../../lib/supabase/service";
import { sameSecret } from "../../../../lib/payment-gateways";
import { sendTelegram, siteBase, type Button } from "../../../../lib/telegram";

export const dynamic = "force-dynamic";

type Queued = { id: number; chat_id: number; body: string; buttons: Button[]; context: Record<string, string> };

/**
 * Sends queued Telegram messages. Allowed with "Authorization: Bearer <CRON_SECRET>" (any scheduler)
 * or with a one-time kick code the database sends right after queueing (no shared secret stored there).
 */
async function dispatch(request: NextRequest, nonce: string | null) {
  const client = serviceClient();
  if (!client || !process.env.TELEGRAM_BOT_TOKEN) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const secret = process.env.CRON_SECRET;
  const byCron = Boolean(secret) && sameSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`);
  const byKick = !byCron && nonce !== null && /^[A-Za-z0-9]{43}$/.test(nonce) && (await client.rpc("telegram_claim_kick", { nonce })).data === true;
  if (!byCron && !byKick) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await client.rpc("telegram_claim", { batch: 20 });
  if (error) return NextResponse.json({ error: "Could not claim" }, { status: 500 });
  const base = siteBase(process.env, request.nextUrl.origin);
  let sent = 0;
  for (const message of (data ?? []) as Queued[]) {
    const result = await sendTelegram(message.chat_id, message.body, message.buttons, base);
    await client.rpc("telegram_report", { message: message.id, ok: result.ok, telegram_message: result.messageId, error: result.ok ? null : result.error ?? "send failed" });
    if (result.ok) sent += 1;
  }
  return NextResponse.json({ claimed: (data ?? []).length, sent });
}

export async function GET(request: NextRequest) { return dispatch(request, null); }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { nonce?: unknown } | null;
  return dispatch(request, typeof body?.nonce === "string" ? body.nonce : null);
}
