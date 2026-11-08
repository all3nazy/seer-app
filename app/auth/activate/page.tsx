"use client";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../../../lib/supabase";
import { ActivationError, requestActivationEmail, verifyActivationInput } from "../../../lib/activation";
import { Logo } from "../../../components/icons";

export default function ActivateAccount() {
  const [email, setEmail] = useState("");
  const [confirmationLink, setConfirmationLink] = useState("");
  const [busy, setBusy] = useState<"request" | "verify" | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const notice = useRef<HTMLParagraphElement>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => { if (error) notice.current?.focus(); }, [error]);

  async function requestEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || cooldown) return;
    inFlight.current = true;
    setBusy("request"); setError(""); setMessage(""); setCooldown(60);
    try {
      await requestActivationEmail(getSupabaseBrowserClient, email, window.location.origin);
      setMessage("إذا أمكن إرسال رسالة لهذا البريد، ستصلك رسالة تفعيل. تحقق من صندوق الوارد والبريد غير المرغوب فيه، ثم انسخ رابط التفعيل من الرسالة دون فتحه وألصقه أدناه.");
    } catch {
      setError("تعذر طلب رسالة التفعيل حاليًا. تحقق من البريد، وانتظر قبل المحاولة مجددًا.");
    } finally { inFlight.current = false; setBusy(null); }
  }
  async function verifyLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const submittedLink = confirmationLink;
    // Remove the bearer link from the field immediately, even when invalid.
    setConfirmationLink("");
    inFlight.current = true;
    setBusy("verify"); setError(""); setMessage("");
    try {
      await verifyActivationInput(getSupabaseBrowserClient, submittedLink, process.env.NEXT_PUBLIC_SUPABASE_URL, window.location.origin);
      window.location.replace("/auth/setup");
    } catch (failure) {
      setError(failure instanceof ActivationError && failure.code === "expired-link"
        ? "انتهت صلاحية هذا الرابط أو سبق استخدامه. اطلب رسالة جديدة، ثم انسخ رابط التفعيل منها دون فتحه والصقه هنا."
        : failure instanceof ActivationError && failure.code === "invalid-link"
          ? "هذا ليس رابط تأكيد صالحًا لخدمة سِير. انسخ رابط التفعيل الأصلي من رسالتك البريدية."
          : "تعذر التحقق من الجلسة. تأكد من نسخ العنوان كاملًا، ثم حاول مجددًا.");
      inFlight.current = false; setBusy(null);
    }
  }

  return <><a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a><main className="shell">
    <header className="top"><Logo /><a href="/login">تسجيل الدخول</a></header>
    <section className="card login-card" id="main-content" tabIndex={-1} aria-labelledby="activation-title">
      <h1 id="activation-title">تفعيل حساب جديد</h1>
      <p>تحقق من بريدك أولًا، ثم عيّن كلمة مرور خاصة بك. تفعيل الحساب لا يمنحك الوصول إلى منشأة؛ ربط الصلاحيات يتم بعد موافقة مسؤول المنصة.</p>
      <form method="post" onSubmit={requestEmail} className="login-form" aria-busy={busy === "request"}>
        <label htmlFor="activation-email">البريد الإلكتروني</label>
        <input id="activation-email" name="email" type="email" dir="ltr" inputMode="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} value={email} onChange={event => setEmail(event.target.value)} readOnly={busy !== null} />
        <button className="primary-button" disabled={busy !== null || cooldown > 0}>{busy === "request" ? "جارٍ طلب الرسالة…" : cooldown > 0 ? `يمكن إعادة الطلب بعد ${cooldown.toLocaleString("ar-SA")} ثانية` : "إرسال رسالة التفعيل"}</button>
      </form>
      {message ? <p role="status">{message}</p> : null}
      <h2>إكمال التفعيل أو استعادة الرابط</h2>
      <p id="activation-link-help">يمكنك نسخ رابط التفعيل الأصلي من الرسالة دون فتحه ولصقه هنا. إذا فتحت الرسالة وظهر خطأ اتصال، انسخ العنوان الكامل من شريط عنوان صفحة الخطأ وألصقه هنا بدلًا منه. لا ترسل أيًّا من الرابطين في الدردشة أو لأي شخص؛ يمنح صاحبه الوصول إلى حسابك.</p>
      <form method="post" onSubmit={verifyLink} className="login-form" aria-busy={busy === "verify"}>
        <label htmlFor="activation-link">رابط التفعيل أو عنوان صفحة خطأ الاتصال</label>
        <input id="activation-link" name="confirmation-link" type="password" dir="ltr" required maxLength={8192} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="activation-link-help" value={confirmationLink} onChange={event => setConfirmationLink(event.target.value)} readOnly={busy !== null} />
        <button className="primary-button" disabled={busy !== null || !confirmationLink.trim()}>{busy === "verify" ? "جارٍ التحقق…" : "تأكيد الرابط وإعداد كلمة المرور"}</button>
      </form>
      {error ? <p role="alert" ref={notice} tabIndex={-1} className="form-error">{error}</p> : null}
      <p><a href="/login">لديك كلمة مرور؟ تسجيل الدخول</a></p>
    </section>
  </main></>;
}
