"use server";
import { revalidatePath } from "next/cache";
import { requestPlatformAdmin } from "../../lib/supabase/server";
import { siteBase, telegramApi, telegramCommands } from "../../lib/telegram";

/**
 * «تفعيل الويبهوك»: points the bot at /api/telegram/webhook with the secret header and sets the
 * command list. Platform admins only. The token and the secret are never returned.
 */
export async function activateTelegramWebhook(): Promise<{ error?: string; success?: string }> {
  if (!(await requestPlatformAdmin())) return { error: "لمسؤول المنصة فقط." };
  if (!process.env.TELEGRAM_BOT_TOKEN) return { error: "متغير TELEGRAM_BOT_TOKEN غير مضبوط في Vercel." };
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !/^[A-Za-z0-9_-]{16,256}$/.test(secret)) return { error: "أضف TELEGRAM_WEBHOOK_SECRET في Vercel (حروف إنجليزية وأرقام و_ و-، ١٦ حرفًا على الأقل) ثم أعد النشر." };
  const url = `${siteBase()}/api/telegram/webhook`;
  const hook = await telegramApi("setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  if (!hook.ok) return { error: `رفض تيليقرام التفعيل: ${hook.description ?? "خطأ غير معروف"}` };
  await telegramApi("setMyCommands", { commands: telegramCommands });
  revalidatePath("/admin/settings");
  return { success: `تفعّل الويبهوك على ${url}` };
}
