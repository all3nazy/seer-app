"use client";
import { useRef, useState } from "react";
import { captchaMissing, useTurnstile } from "../../../components/turnstile";
import { signInMessages } from "../../../lib/login-messages";
import { signIn as serverSignIn } from "../../login/actions";

/**
 * «سِير أدمن» sign-in: the same server sign-in as the platform (login guard + Turnstile), then the
 * mandatory two-step verification. Never sends anyone to the platform's sign-in.
 */
export default function AdminLogin() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const captcha = useTurnstile("admin_login");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    const fail = (message: string) => { setError(message); setBusy(false); requestAnimationFrame(() => errorRef.current?.focus()); };
    try {
      const token = await captcha.getToken();
      if (captcha.enabled && !token) { fail(captchaMissing); return; }
      const result = await serverSignIn(login, password, token);
      captcha.reset();
      if (!result.ok) { fail(result.error); return; }
      window.location.assign("/admin/verify");
    } catch {
      captcha.reset();
      fail(signInMessages.invalid);
    }
  }
  return <main className="adm-auth" id="main-content">
    <section className="card adm-auth-card" aria-labelledby="admin-login-title">
      <div className="adm-auth-brand"><span className="adm-logo">سِير<span className="adm-dot" aria-hidden="true" /></span><span className="adm-pill">أدمن</span></div>
      <h1 id="admin-login-title" style={{ margin: 0, fontSize: 22 }}>دخول لوحة مالك المنصة</h1>
      <p className="hint" style={{ margin: 0 }}>بعد كلمة المرور تأكّد دخولك برمز من تطبيق التحقق على جوالك.</p>
      <form method="post" onSubmit={submit} className="login-form" aria-busy={busy}>
        <label htmlFor="admin-login">البريد أو اسم المستخدم</label>
        <input id="admin-login" dir="ltr" required autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} value={login} onChange={event => setLogin(event.target.value)} readOnly={busy} />
        <label htmlFor="admin-password">كلمة المرور</label>
        <input id="admin-password" type="password" dir="ltr" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} readOnly={busy} />
        {captcha.widget}
        {captcha.message && !error ? <p className="hint" role="status" style={{ margin: 0 }}>{captcha.message}</p> : null}
        {error ? <p ref={errorRef} tabIndex={-1} role="alert" className="form-error">{error}</p> : null}
        <button type="submit" className="primary-button" disabled={busy}>{busy ? "جارٍ التحقق…" : "التالي"}</button>
      </form>
    </section>
  </main>;
}
