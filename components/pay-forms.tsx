"use client";
import { useState, useTransition } from "react";
import { useActionState, useEffect } from "react";
import { finishSandbox, startPayment } from "../app/pay/actions";
import { savePaymentSettings, saveWebhookSecret } from "../app/dashboard/finance/online/actions";
import { payMethodLabels, payMethods, providerLabels, providers, type PayMethod } from "../lib/payments";
import { notify } from "./feedback";

/** "Pay now" on the family's invoice link. */
export function PayNow({ token, methods, test }: { token: string; methods: PayMethod[]; test: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return <section className="pay-now no-print">
    <h2>ادفع الآن</h2>
    {test ? <p className="hint">وضع تجربة: ما ينخصم أي مبلغ.</p> : null}
    <div className="pay-methods">{methods.map(method => <button key={method} type="button" className={`pay-method m-${method}`} disabled={pending}
      onClick={() => start(async () => { const result = await startPayment(token, method); if (result?.error) setError(result.error); })}>{payMethodLabels[method]}</button>)}</div>
    {error ? <p role="alert" className="form-error">{error}</p> : null}
  </section>;
}
export function SandboxCheckout({ token, intent }: { token: string; intent: string }) {
  const [pending, start] = useTransition();
  return <div className="pay-methods">
    <button type="button" className="pay-method m-mada" disabled={pending} onClick={() => start(async () => { await finishSandbox(token, intent, true); })}>إتمام الدفع التجريبي</button>
    <button type="button" className="btn" disabled={pending} onClick={() => start(async () => { await finishSandbox(token, intent, false); })}>إلغاء</button>
  </div>;
}

export function PaymentSettingsForm({ organizationId, settings }: { organizationId: string; settings: { provider: string; mode: string; methods: string[]; publishable_key: string | null; is_enabled: boolean } | null }) {
  const [state, action, pending] = useActionState(savePaymentSettings, {});
  const [provider, setProvider] = useState(settings?.provider ?? "sandbox");
  useEffect(() => { if (state.success) notify(state.success, "info", "done"); else if (state.error) notify(state.error, "error"); }, [state]);
  return <form action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} />
    <label>البوابة<select name="provider" value={provider} onChange={event => setProvider(event.target.value)}>{providers.map(item => <option key={item} value={item}>{providerLabels[item]}</option>)}</select></label>
    {provider !== "sandbox" && provider !== "none" ? <>
      <label>الوضع<select name="mode" defaultValue={settings?.mode ?? "test"}><option value="test">تجريبي (مفاتيح الاختبار)</option><option value="live">حقيقي</option></select></label>
      <label>المفتاح العام (Publishable key)<input name="publishable_key" dir="ltr" defaultValue={settings?.publishable_key ?? ""} placeholder="pk_test_…" /></label>
    </> : null}
    <fieldset className="quote-items" style={{ gridColumn: "1/-1" }}><legend>طرق الدفع المتاحة للأهالي</legend>
      {payMethods.map(method => <label key={method} className="quote-check"><input type="checkbox" name="methods" value={method} defaultChecked={(settings?.methods ?? ["mada", "visa_master", "apple_pay"]).includes(method)} /> {payMethodLabels[method]}</label>)}
    </fieldset>
    <label className="quote-check" style={{ gridColumn: "1/-1" }}><input type="checkbox" name="is_enabled" defaultChecked={settings?.is_enabled ?? false} /> تفعيل زر «ادفع الآن» في روابط الفواتير</label>
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ"}</button>
  </form>;
}

/** Moyasar's hosted card / Apple Pay / STC Pay form, loaded only for a live or test Moyasar setup. */
export function MoyasarForm({ publishableKey, amountHalalas, description, intent, callbackUrl, methods }: { publishableKey: string; amountHalalas: number; description: string; intent: string; callbackUrl: string; methods: string[] }) {
  useEffect(() => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.css";
    const script = document.createElement("script"); script.src = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.js";
    script.onload = () => {
      const moyasar = (window as unknown as { Moyasar?: { init: (options: Record<string, unknown>) => void } }).Moyasar;
      moyasar?.init({ element: ".moyasar-form", amount: amountHalalas, currency: "SAR", description, publishable_api_key: publishableKey, callback_url: callbackUrl, metadata: { intent }, methods });
    };
    document.head.append(css, script);
    return () => { css.remove(); script.remove(); };
  }, [publishableKey, amountHalalas, description, intent, callbackUrl, methods]);
  return <div className="moyasar-form" />;
}

/** Paste the gateway's webhook secret once; it is stored hashed and never shown again. */
export function WebhookSecretForm({ organizationId, gateway, configured }: { organizationId: string; gateway: string; configured: boolean }) {
  const [state, action, pending] = useActionState(saveWebhookSecret, {});
  const [key, setKey] = useState(0);
  useEffect(() => { if (state.success) { notify(state.success, "info", "done"); setKey(value => value + 1); } else if (state.error) notify(state.error, "error"); }, [state]);
  return <form key={key} action={action} className="composer">
    <input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="gateway" value={gateway} />
    <p className="hint" style={{ gridColumn: "1/-1", margin: 0 }}>{configured ? "✓ رمز الـWebhook محفوظ (مشفّر). تقدر تستبدله أو تزيله." : "ما فيه رمز محفوظ: إشعارات البوابة تُرفض حتى تضيفه."}</p>
    <label style={{ gridColumn: "1/-1" }}>رمز الـWebhook (Secret Token) من لوحة البوابة<input name="secret" type="password" autoComplete="off" dir="ltr" maxLength={200} /></label>
    {configured ? <label className="quote-check"><input type="checkbox" name="remove" /> إزالة الرمز</label> : null}
    <button type="submit" className="btn-primary" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ الرمز"}</button>
  </form>;
}
