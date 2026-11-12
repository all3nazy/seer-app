"use client";
import { useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { Logo } from "../../components/icons";
import { loginEmail } from "../../lib/login";
import { LegalFooter } from "../../components/legal-page";
import { supportEmail, supportMailto } from "../../lib/support";

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
      const { error: authError } = await getSupabaseBrowserClient().auth.signInWithPassword({ email: loginEmail(email), password });
      if (authError) throw authError;
      window.location.assign("/dashboard");
    } catch {
      setError("تعذر تسجيل الدخول. تحقق من اسم المستخدم أو البريد وكلمة المرور.");
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
        <label htmlFor="email">اسم المستخدم أو البريد الإلكتروني</label>
        <input id="email" name="email" type="text" dir="ltr" inputMode="email" required autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} value={email} onChange={event => setEmail(event.target.value)} readOnly={busy}/>
        <label htmlFor="password">كلمة المرور</label>
        <div className="password-control">
          <input id="password" name="password" type={showPassword ? "text" : "password"} dir="ltr" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} readOnly={busy}/>
          <button type="button" className="password-toggle" aria-controls="password" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? "إخفاء" : "إظهار"}</button>
        </div>
        {error && <p ref={errorRef} tabIndex={-1} role="alert" className="form-error">{error}</p>}
        <button type="submit" disabled={busy} className="primary-button">{busy ? "جارٍ التحقق…" : "دخول"}</button>
        <span role="status" className="sr-only">{busy ? "جارٍ تسجيل الدخول. يرجى الانتظار." : ""}</span>
      </form>
      <p className="login-help">موظف جديد؟ اطلب من إدارتك «رابط الانضمام» على واتساب، وتختار منه اسم المستخدم وكلمة المرور. نسيت كلمة المرور؟ مديرك يقدر يعيّن لك واحدة جديدة.</p>
      <p className="login-help">تحتاج مساعدة؟ راسلنا على <a href={supportMailto} dir="ltr">{supportEmail}</a></p>
    </section>
    <LegalFooter />
  </main></>;
}
