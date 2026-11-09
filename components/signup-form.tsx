"use client";
import { useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase";

const errors: Record<string, string> = {
  "23505": "سبق استخدام التجربة المجانية بهذا البريد أو الجوال. سجّل دخولك، أو تواصل معنا للاشتراك مباشرة.",
  "54000": "محاولات كثيرة. حاول بعد قليل.",
  "22023": "تحقق من البيانات: الاسم، وجوال سعودي يبدأ بـ 05، وبريد صحيح، واسم المنشأة.",
};
/** Sign-up: records the request, creates the account, and asks for the email to be verified. */
export function SignupForm() {
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", password: "", org_name: "", org_type: "school" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(current => ({ ...current, [key]: event.target.value }));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (form.password.length < 8 || !/\d/.test(form.password) || !/\D/.test(form.password)) { setError("كلمة المرور ٨ أحرف على الأقل وفيها حروف وأرقام."); return; }
    setBusy(true); setError("");
    const client = getSupabaseBrowserClient();
    const { error: startError } = await client.rpc("start_signup", { email: form.email.trim(), phone: form.phone, full_name: form.full_name, org_name: form.org_name, org_type: form.org_type });
    if (startError) { setError(errors[startError.code ?? ""] ?? "تعذر التسجيل الآن. حاول مرة ثانية."); setBusy(false); return; }
    const { data, error: signUpError } = await client.auth.signUp({ email: form.email.trim().toLowerCase(), password: form.password, options: { emailRedirectTo: `${location.origin}/auth/callback?next=/dashboard`, data: { full_name: form.full_name } } });
    if (signUpError) { setError(/registered|exists/i.test(signUpError.message) ? "هذا البريد مسجّل. سجّل دخولك بنفس البريد وتنشأ منشأتك تلقائيًا." : "تعذر إنشاء الحساب. تحقق من البريد وحاول مرة ثانية."); setBusy(false); return; }
    if (data.session) {
      // Email confirmation is off on this project: the account is ready, so finish right away.
      await client.rpc("complete_signup");
      location.assign("/dashboard");
      return;
    }
    setSent(true); setBusy(false);
  }
  if (sent) return <div className="info-banner" role="status" style={{ display: "grid", gap: 8 }}>
    <strong>وصلتك رسالة توثيق على {form.email}</strong>
    <span>افتح الرابط في الرسالة لتوثيق بريدك، وبعدها تنشأ منشأتك وتبدأ التجربة مباشرة. ما وصلت؟ تحقق من البريد غير المرغوب فيه، أو سجّل دخولك بعد التوثيق.</span>
  </div>;
  return <form method="post" onSubmit={submit} className="login-form" aria-busy={busy}>
    <label htmlFor="su-name">اسمك</label>
    <input id="su-name" value={form.full_name} onChange={set("full_name")} required maxLength={80} autoComplete="name" />
    <label htmlFor="su-phone">رقم الجوال</label>
    <input id="su-phone" type="tel" dir="ltr" inputMode="tel" value={form.phone} onChange={set("phone")} required maxLength={16} placeholder="05xxxxxxxx" autoComplete="tel" />
    <label htmlFor="su-email">البريد الإلكتروني</label>
    <input id="su-email" type="email" dir="ltr" value={form.email} onChange={set("email")} required maxLength={254} autoComplete="email" />
    <label htmlFor="su-password">كلمة المرور</label>
    <input id="su-password" type="password" dir="ltr" value={form.password} onChange={set("password")} required minLength={8} autoComplete="new-password" />
    <label htmlFor="su-org">اسم المنشأة</label>
    <input id="su-org" value={form.org_name} onChange={set("org_name")} required maxLength={120} />
    <label htmlFor="su-type">نوع المنشأة</label>
    <select id="su-type" value={form.org_type} onChange={set("org_type")}><option value="school">مدرسة</option><option value="nursery">حضانة</option><option value="kindergarten">روضة</option></select>
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    <button type="submit" className="primary-button" disabled={busy}>{busy ? "جارٍ التسجيل…" : "ابدأ التجربة المجانية"}</button>
    <p className="hint" style={{ margin: 0 }}>تجربة وحدة لكل بريد ولكل جوال. بالتسجيل توافق على شروط الاستخدام.</p>
  </form>;
}
