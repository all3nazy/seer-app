"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { loginEmail } from "../lib/login";
import { inviteReasons, isInviteToken, orgTypeLabels, trialLabel } from "../lib/org-invites";
import { LEGAL_VERSION } from "../lib/legal";

type View = { valid: true; organization: string; type: string; trial_months: number; plan: string } | { valid: false; reason: string };
const accountErrors: Record<string, string> = {
  "23505": "اسم المستخدم أو البريد محجوز. جرّب اسمًا آخر.",
  "22023": "اسم المستخدم من ٣ إلى ٣٠ حرفًا إنجليزيًا أو رقمًا (أو بريد)، وكلمة المرور ٨ أحرف على الأقل فيها حروف وأرقام، والموافقة على الشروط مطلوبة.",
};

/**
 * The owner's invite page. The token is read from the address #fragment (never sent to the web server)
 * and sent to the database only in request bodies. Nothing about the token is shown in errors.
 */
export function InviteAccept() {
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [form, setForm] = useState({ name: "", login: "", password: "", agree: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const value = decodeURIComponent(location.hash.slice(1)).trim();
    if (!isInviteToken(value)) { setView({ valid: false, reason: "invalid" }); return; }
    setToken(value);
    const client = getSupabaseBrowserClient();
    void Promise.all([client.rpc("org_invite_view", { token: value }), client.auth.getSession()]).then(([result, session]) => {
      setSignedIn(Boolean(session.data.session));
      setView(result.error || !result.data ? { valid: false, reason: "unavailable" } : result.data as View);
    }).catch(() => setView({ valid: false, reason: "unavailable" }));
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !token || !form.agree) return;
    setBusy(true); setError("");
    const client = getSupabaseBrowserClient();
    const { data, error: rpcError } = await client.rpc("accept_org_invite", signedIn
      ? { token, name: form.name.trim(), legal_version: LEGAL_VERSION }
      : { token, login: form.login.trim(), password: form.password, name: form.name.trim(), legal_version: LEGAL_VERSION });
    if (rpcError) { setError(accountErrors[rpcError.code ?? ""] ?? "تعذر التفعيل. حاول مرة ثانية."); setBusy(false); return; }
    const result = data as { ok: boolean; reason?: string; login?: string; organization_id?: string };
    if (!result.ok) { setView({ valid: false, reason: result.reason ?? "invalid" }); setBusy(false); return; }
    if (!signedIn) {
      const { error: signInError } = await client.auth.signInWithPassword({ email: result.login ?? loginEmail(form.login), password: form.password });
      if (signInError) { window.location.assign("/login?activated=1"); return; }
    }
    window.location.assign(`/dashboard?org=${encodeURIComponent(result.organization_id ?? "")}`);
  }
  if (!view) return <p aria-busy="true">جارٍ التحقق من الرابط…</p>;
  if (!view.valid) return <>
    <h1 id="invite-title">الرابط غير صالح</h1>
    <p role="alert">{inviteReasons[view.reason] ?? "تعذر التحقق من الرابط الآن. حاول بعد قليل."}</p>
    <p><a href="/login">لديك حساب؟ تسجيل الدخول</a></p>
  </>;
  return <>
    <h1 id="invite-title">أهلًا بكم في سِير</h1>
    <p>تفعيل <strong>{view.organization}</strong> ({orgTypeLabels[view.type] ?? view.type}) بتجربة مجانية لمدة {trialLabel(view.trial_months)} على باقة «{view.plan}». بعد التفعيل تكون أنت مالك المنشأة وتدخل مباشرة.</p>
    <form method="post" onSubmit={submit} className="login-form" aria-busy={busy} aria-labelledby="invite-title">
      <label htmlFor="invite-name">اسمك</label>
      <input id="invite-name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} maxLength={80} required autoComplete="name" />
      {signedIn ? <p className="hint" style={{ margin: 0 }}>أنت مسجّل دخول، وبتنضاف المنشأة لحسابك الحالي.</p> : <>
        <label htmlFor="invite-login">اسم المستخدم (أو بريدك)</label>
        <input id="invite-login" dir="ltr" value={form.login} onChange={event => setForm({ ...form, login: event.target.value })} required autoCapitalize="none" spellCheck={false} autoComplete="username" placeholder="nukhba.admin" maxLength={254} />
        <label htmlFor="invite-password">كلمة المرور</label>
        <input id="invite-password" type="password" dir="ltr" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} required minLength={8} autoComplete="new-password" />
        <p className="hint" style={{ margin: 0 }}>٨ أحرف على الأقل، فيها حروف وأرقام. احفظ اسم المستخدم؛ تدخل فيه كل مرة.</p>
      </>}
      <label className="quote-check consent-check"><input type="checkbox" checked={form.agree} onChange={event => setForm({ ...form, agree: event.target.checked })} required />
        <span>قرأت <a href="/terms" target="_blank" rel="noopener noreferrer">شروط الاستخدام</a> و<a href="/privacy" target="_blank" rel="noopener noreferrer">سياسة الخصوصية</a> وأوافق عليها نيابةً عن المنشأة.</span></label>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      <button type="submit" className="primary-button" disabled={busy || !form.agree}>{busy ? "جارٍ التفعيل…" : signedIn ? "فعّل المنشأة على حسابي" : "فعّل المنشأة وادخل"}</button>
    </form>
  </>;
}
