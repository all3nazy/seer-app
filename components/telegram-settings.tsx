"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { activateTelegramWebhook } from "../app/admin/telegram-actions";
import { confirmAction } from "./confirm";
import { notify } from "./feedback";

export type TelegramState = { linked: boolean; username: string | null; linked_at: string | null; queued: number; failed: number };
export type BotInfo = { username: string | null; configured: boolean; secret: boolean; webhook: { url: string; pending: number; lastError: string | null } | null };

/** Linking this admin's Telegram, unlinking, and activating the bot's webhook. */
export function TelegramSettings({ state, bot }: { state: TelegramState | null; bot: BotInfo }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const refresh = () => startTransition(() => router.refresh());
  async function link() {
    setBusy(true);
    const { data, error } = await getSupabaseBrowserClient().rpc("telegram_link_code");
    setBusy(false);
    if (error || typeof data !== "string") { notify(error?.code === "42501" ? "لمسؤول المنصة فقط." : "تعذر إنشاء الرمز.", "error"); return; }
    setCode(data);
  }
  async function unlink() {
    if (!(await confirmAction("إلغاء ربط تيليقرام؟ توقف رسائل المنصة على تيليقرام لحسابك."))) return;
    const { error } = await getSupabaseBrowserClient().rpc("telegram_unlink");
    if (error) { notify("تعذر فك الربط.", "error"); return; }
    notify("أُلغي ربط تيليقرام.", "info", "done");
    refresh();
  }
  const activate = () => start(async () => {
    const result = await activateTelegramWebhook();
    notify(result.error ?? result.success ?? "تم", result.error ? "error" : "info", result.error ? undefined : "done");
  });
  const deepLink = bot.username && code ? `https://t.me/${bot.username}?start=${code}` : null;
  return <div className="telegram-settings" style={{ display: "grid", gap: 14 }}>
    {!bot.configured ? <p className="info-banner" role="status">أضف TELEGRAM_BOT_TOKEN في Vercel ثم أعد النشر.</p> : null}
    <div>
      <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>البوت والويبهوك</h3>
      <p className="hint" style={{ margin: "0 0 8px" }}>
        {bot.username ? <>البوت: <a href={`https://t.me/${bot.username}`} target="_blank" rel="noopener noreferrer" dir="ltr">@{bot.username}</a> · </> : null}
        {bot.webhook?.url ? <>الويبهوك مفعّل{bot.webhook.pending ? ` · ${bot.webhook.pending} تحديث بالانتظار` : ""}</> : "الويبهوك غير مفعّل"}
        {bot.webhook?.lastError ? <> · آخر خطأ: {bot.webhook.lastError}</> : null}
      </p>
      {!bot.secret ? <p className="hint">أضف TELEGRAM_WEBHOOK_SECRET في Vercel قبل التفعيل.</p> : null}
      <button type="button" className="btn" disabled={pending || !bot.configured || !bot.secret} onClick={activate}>{pending ? "جارٍ التفعيل…" : "تفعيل الويبهوك"}</button>
    </div>
    <div>
      <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>حسابك</h3>
      {state?.linked ? <>
        <p style={{ margin: "0 0 8px" }}>✓ مربوط{state.username ? <> بـ<span dir="ltr">@{state.username}</span></> : null}. توصلك هناك تذاكر الدعم وطلبات الانضمام والتحويلات والمنشآت الجديدة والتنبيهات، والملخص اليومي ٨ صباحًا.</p>
        {state.failed ? <p className="hint">{state.failed} رسالة فشل إرسالها اليوم.</p> : null}
        <button type="button" className="btn btn-danger" onClick={() => void unlink()}>فك الربط</button>
      </> : code ? <div className="invite-fresh" role="status">
        <p style={{ margin: 0 }}>أرسل للبوت هذا الأمر خلال ١٠ دقائق (الرمز لمرة وحدة):</p>
        <input readOnly dir="ltr" value={`/link ${code}`} aria-label="أمر الربط" onFocus={event => event.currentTarget.select()} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {deepLink ? <a className="btn btn-primary" href={deepLink} target="_blank" rel="noopener noreferrer">افتح البوت واربط مباشرة</a> : null}
          <button type="button" className="btn" onClick={refresh}>ربطته، حدّث الحالة</button>
        </div>
      </div> : <button type="button" className="btn btn-primary" disabled={busy || !bot.configured} onClick={() => void link()}>{busy ? "…" : "اربط تيليقرام"}</button>}
    </div>
  </div>;
}
