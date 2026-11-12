import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "../../../../lib/supabase/service";
import { inviteReply, sendTelegram, siteBase, telegramApi, webhookAllowed, type Handled } from "../../../../lib/telegram";

export const dynamic = "force-dynamic";

/**
 * Updates from Telegram. Only requests with the secret header set in setWebhook are accepted. The
 * database decides everything (linked chats only, acting as the linked admin); this route only sends
 * what it answers. Telegram always gets 200 back so it does not resend the same update.
 */
export async function POST(request: NextRequest) {
  if (!webhookAllowed(request.headers.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const client = serviceClient();
  if (!client || !process.env.TELEGRAM_BOT_TOKEN) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const update = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!update || typeof update !== "object") return NextResponse.json({ ok: true });
  const { data, error } = await client.rpc("telegram_handle", { update });
  if (error) { console.error("telegram webhook: the database could not handle the update"); return NextResponse.json({ ok: true }); }
  const handled = (data ?? {}) as Handled;
  const base = siteBase(process.env, request.nextUrl.origin);
  for (const reply of handled.replies ?? []) {
    if (reply.invite) {
      const rendered = inviteReply(reply.invite, base);
      await sendTelegram(reply.chat_id, rendered.text, rendered.buttons, base);
      continue;
    }
    if (!reply.text) continue;
    const sent = await sendTelegram(reply.chat_id, reply.text, reply.buttons, base);
    if (sent.ok && sent.messageId && reply.track) await client.rpc("telegram_track", { chat: reply.chat_id, telegram_message: sent.messageId, context: reply.track });
  }
  if (handled.answer?.id) await telegramApi("answerCallbackQuery", { callback_query_id: handled.answer.id, text: handled.answer.text.slice(0, 190) });
  if (handled.clear) await telegramApi("editMessageReplyMarkup", { chat_id: handled.clear.chat_id, message_id: handled.clear.message_id, reply_markup: { inline_keyboard: [] } });
  return NextResponse.json({ ok: true });
}
