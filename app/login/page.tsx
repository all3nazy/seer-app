"use client";
import { useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { Logo } from "../../components/icons";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: authError } = await getSupabaseBrowserClient().auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      window.location.assign("/dashboard");
    } catch {
      setError("تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور، أو حاول لاحقًا.");
      setBusy(false);
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  return <><a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a><main className="shell">
    <header className="top"><Logo /></header>
    <section className="card login-card" id="main-content" tabIndex={-1} aria-labelledby="login-title">
      <h1 id="login-title">تسجيل الدخول</h1>
      <p id="login-description">أهلًا فيك. ادخل بحساب منشأتك.</p>
      <form method="post" onSubmit={signIn} className="login-form" aria-describedby="login-description" aria-busy={busy}>
        <label htmlFor="email">البريد الإلكتروني</label>
        <input id="email" name="email" type="email" dir="ltr" inputMode="email" required autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} value={email} onChange={event => setEmail(event.target.value)} readOnly={busy}/>
        <label htmlFor="password">كلمة المرور</label>
        <div className="password-control">
          <input id="password" name="password" type={showPassword ? "text" : "password"} dir="ltr" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} readOnly={busy}/>
          <button type="button" className="password-toggle" aria-controls="password" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? "إخفاء" : "إظهار"}</button>
        </div>
        {error && <p ref={errorRef} tabIndex={-1} role="alert" className="form-error">{error}</p>}
        <button type="submit" disabled={busy} className="primary-button">{busy ? "جارٍ التحقق…" : "دخول"}</button>
        <span role="status" className="sr-only">{busy ? "جارٍ تسجيل الدخول. يرجى الانتظار." : ""}</span>
      </form>
      <p className="login-help"><a href="/auth/activate">تفعيل حساب جديد</a> — يلزم موافقة مسؤول المنصة للوصول إلى المنشأة.</p>
    </section>
  </main></>;
}
