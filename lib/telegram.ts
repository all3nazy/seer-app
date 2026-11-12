import { sameSecret } from "./payment-gateways";
import { inviteLink, inviteMessage } from "./org-invites";
import { whatsappLink } from "./share";

/**
 * Telegram Bot API for the platform admins. The bot token comes from TELEGRAM_BOT_TOKEN and is only
 * placed in the request address; it is never returned, logged or put in an error message.
 */
export type Button = { text: string; data?: string; url?: string };
export type Reply = { chat_id: number; text?: string; buttons?: Button[]; track?: Record<string, string>; invite?: Invite };
export type Invite = { token: string; org_name: string; contact_name?: string; phone?: string; trial_months: number };
export type Handled = { replies?: Reply[]; answer?: { id: string; text: string }; clear?: { chat_id: number; message_id: number } };

export const telegramCommands = [
  { command: "summary", description: "ملخص المنصة الآن" },
  { command: "link", description: "ربط هذه المحادثة بحسابك" },
  { command: "help", description: "الأوامر" },
  { command: "start", description: "البداية" },
];

/** The Telegram webhook sends this header; anything else is refused. */
export function webhookAllowed(header: string | null, secret: string | undefined): boolean {
  return Boolean(secret) && sameSecret(header ?? "", secret ?? "");
}

/** The official address for links in messages (relative paths become absolute). */
export function siteBase(env: Record<string, string | undefined> = process.env, fallback = "https://seersa.vercel.app"): string {
  const host = (env.SEER_CANONICAL_HOST ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return host ? `https://${host}` : fallback;
}

/** Inline buttons, two per row; relative links point to the official address. */
type Key = { text: string; callback_data: string } | { text: string; url: string };
export function replyMarkup(buttons: Button[] | undefined, base: string): { inline_keyboard: Key[][] } | undefined {
  const keys: Key[] = [];
  for (const button of buttons ?? []) {
    if (button.data && button.data.length <= 64) keys.push({ text: button.text, callback_data: button.data });
    else if (button.url) keys.push({ text: button.text, url: button.url.startsWith("/") ? `${base}${button.url}` : button.url });
  }
  if (!keys.length) return undefined;
  const rows: Key[][] = [];
  for (let index = 0; index < keys.length; index += 2) rows.push(keys.slice(index, index + 2));
  return { inline_keyboard: rows };
}

/** The message after «أرسل دعوة»: the link, and a button that opens WhatsApp with the message ready. */
export function inviteReply(invite: Invite, base: string): { text: string; buttons: Button[] } {
  const link = inviteLink(base, invite.token);
  const message = inviteMessage(invite.org_name, invite.trial_months, link);
  return {
    text: [`✅ رابط دعوة «${invite.org_name}» جاهز (${invite.trial_months} أشهر، صالح ٧ أيام ولمرة وحدة):`, link, "", invite.contact_name ? `أرسله لـ${invite.contact_name}${invite.phone ? ` (${invite.phone})` : ""} من الزر تحت؛ الرسالة جاهزة.` : "الرسالة جاهزة في الزر تحت."].join("\n"),
    buttons: [{ text: "افتح واتساب بالرسالة", url: whatsappLink(invite.phone ?? null, message) }],
  };
}

type ApiResult = { ok: boolean; result?: unknown; description?: string };
/** Calls the Bot API. Errors carry Telegram's description only, never the address (it holds the token). */
export async function telegramApi(method: string, body: Record<string, unknown>, token = process.env.TELEGRAM_BOT_TOKEN, fetcher: typeof fetch = fetch): Promise<ApiResult> {
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN is not set" };
  try {
    const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json().catch(() => ({ ok: false, description: `HTTP ${response.status}` })) as ApiResult;
    return json.ok ? json : { ok: false, description: String(json.description ?? `HTTP ${response.status}`).replaceAll(token, "***").slice(0, 200) };
  } catch {
    return { ok: false, description: "network error" };
  }
}

/** Sends one message; returns its Telegram id when sent. */
export async function sendTelegram(chat: number, text: string, buttons: Button[] | undefined, base: string, token?: string, fetcher?: typeof fetch): Promise<{ ok: boolean; messageId: number | null; error?: string }> {
  const result = await telegramApi("sendMessage", { chat_id: chat, text: text.slice(0, 4000), reply_markup: replyMarkup(buttons, base), disable_web_page_preview: true }, token, fetcher);
  const id = (result.result as { message_id?: number } | undefined)?.message_id ?? null;
  return result.ok ? { ok: true, messageId: id } : { ok: false, messageId: null, error: result.description };
}
