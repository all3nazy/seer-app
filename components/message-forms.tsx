"use client";
import { useActionState, useEffect, useTransition } from "react";
import { markMessage, saveMessageSettings } from "../app/dashboard/messages/actions";
import { confirmPickup } from "../app/c/actions";
import { messageProviderLabels, toggles, type MessageProvider } from "../lib/messaging";
import { whatsappLink } from "../lib/share";
import { notify } from "./feedback";

type Settings = Record<string, string | boolean | null> | null;
export function MessageSettingsForm({ organizationId, settings }: { organizationId: string; settings: Settings }) {
  const [state, action, pending] = useActionState(saveMessageSettings, {});
  useEffect(() => { if (state.success) notify(state.success, "info", "done"); else if (state.error) notify(state.error, "error"); }, [state]);
  const on = (key: string) => settings ? Boolean(settings[key]) : !["notify_bus", "notify_daily_report"].includes(key);
  return <form action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} />
    <p className="hint" style={{ gridColumn: "1/-1", margin: 0 }}>طريقة الإرسال: <strong>{messageProviderLabels[(settings?.provider as MessageProvider) ?? "manual"] ?? messageProviderLabels.manual}</strong>{settings?.sender_name ? ` · المرسل: ${settings.sender_name}` : ""}. ربط مزوّد الرسائل واسم المرسل يفعّلها فريق المنصة بعد الاشتراك، حمايةً لحساباتكم من الإساءة.</p>
    <label>القناة<select name="channel" defaultValue={String(settings?.channel ?? "whatsapp")}><option value="whatsapp">واتساب</option><option value="sms">رسالة نصية SMS</option></select></label>
    <fieldset className="quote-items" style={{ gridColumn: "1/-1" }}><legend>الرسائل التلقائية</legend>
      {toggles.map(([key, label]) => <label key={key} className="quote-check"><input type="checkbox" name={key} defaultChecked={on(key)} /> {label}</label>)}
    </fieldset>
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ"}</button>
  </form>;
}

/** One queued message: open WhatsApp with the text ready, then mark it sent. */
export function OutboxActions({ id, phone, body, status }: { id: string; phone: string; body: string; status: string }) {
  const [pending, start] = useTransition();
  const mark = (next: "sent" | "skipped" | "queued") => start(async () => { const result = await markMessage(id, next); if (result.error) notify(result.error, "error"); });
  if (status !== "queued" && status !== "failed") return status === "skipped" || status === "sent" ? <button type="button" className="btn btn-sm" disabled={pending} onClick={() => mark("queued")}>إرجاع</button> : null;
  return <span className="share-doc">
    <a className="btn btn-sm share-wa" href={whatsappLink(phone, body)} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => mark("sent"), 400)}>إرسال واتساب</a>
    <button type="button" className="btn btn-sm" disabled={pending} onClick={() => mark("skipped")}>تجاهل</button>
  </span>;
}

const outcomes: Record<string, { tone: string; text: string }> = {
  confirmed: { tone: "ok", text: "✓ تم تأكيد الاستلام. شكرًا لكم." },
  confirmed_unverified: { tone: "ok", text: "✓ تم تأكيد الاستلام. (رقم الهوية غير مسجّل لدى المدرسة، سجّلناه كما أدخلتموه.)" },
  already: { tone: "ok", text: "الاستلام مؤكد من قبل." },
  mismatch: { tone: "bad", text: "رقم الهوية ما يطابق المسجّل لدى المدرسة. تأكد وحاول مرة ثانية." },
  invalid: { tone: "bad", text: "اكتب رقم هوية أو إقامة صحيح (١٠ أرقام)." },
  locked: { tone: "bad", text: "انقفل الرابط بعد محاولات خاطئة. تواصل مع المدرسة." },
  not_found: { tone: "bad", text: "الرابط غير صالح أو منتهي." },
  error: { tone: "bad", text: "تعذر التأكيد الآن. حاول بعد قليل." },
};
export function ConfirmPickupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(confirmPickup, {});
  const outcome = state.result ? outcomes[state.result] ?? outcomes.error : null;
  if (outcome && outcome.tone === "ok") return <div className="portal-card pay-result ok"><strong>{outcome.text}</strong></div>;
  return <form action={action} className="portal-card confirm-form">
    <input type="hidden" name="token" value={token} />
    <label>رقم الهوية أو الإقامة<input name="national_id" inputMode="numeric" dir="ltr" autoComplete="off" maxLength={14} required placeholder="1XXXXXXXXX" /></label>
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "…" : "تأكيد الاستلام"}</button>
    {outcome ? <p role="alert" className="form-error">{outcome.text}</p> : null}
  </form>;
}
