import { telegramApi } from "./telegram";
import type { BotInfo } from "../components/telegram-settings";

/** The bot's name and webhook state, read with the token on the server (the token never leaves it). */
export async function botInfo(): Promise<BotInfo> {
  const configured = Boolean(process.env.TELEGRAM_BOT_TOKEN), secret = Boolean(process.env.TELEGRAM_WEBHOOK_SECRET);
  if (!configured) return { configured, secret, username: null, webhook: null };
  const [me, hook] = await Promise.all([telegramApi("getMe", {}), telegramApi("getWebhookInfo", {})]);
  const info = hook.result as { url?: string; pending_update_count?: number; last_error_message?: string } | undefined;
  return { configured, secret, username: (me.result as { username?: string } | undefined)?.username ?? null,
    webhook: info?.url ? { url: info.url, pending: info.pending_update_count ?? 0, lastError: info.last_error_message ?? null } : null };
}

