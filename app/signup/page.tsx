import { Logo } from "../../components/icons";
import { SignupForm } from "../../components/signup-form";
import { pilotMode, pilotTexts } from "../../lib/pilot";
import { supportLink } from "../../lib/support";

export const dynamic = "force-dynamic";

export const metadata = { title: "ابدأ تجربتك المجانية", description: "سجّل مدرستك أو حضانتك في سِير وجرّب كل المزايا مجانًا." };

export default function SignupPage() {
  const support = supportLink(process.env.SEER_SUPPORT_WHATSAPP ?? "");
  return <><a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a><main className="shell">
    <header className="top"><Logo /><nav aria-label="التنقل الرئيسي" style={{ display: "flex", gap: 8 }}><a className="btn" href="/pricing">الأسعار</a><a className="btn" href="/login">تسجيل الدخول</a></nav></header>
    {pilotMode() ? <section className="card login-card" id="main-content" tabIndex={-1} aria-labelledby="signup-title">
      <h1 id="signup-title">{pilotTexts.signup}</h1>
      <p>سِير في مرحلة تجريبية مجانية مع عدد محدود من المدارس والحضانات. إذا تبي تنضم، تواصل معنا ونرسل لك دعوة.</p>
      {support ? <a className="primary-button" href={support} target="_blank" rel="noopener noreferrer" style={{ width: "100%" }}>تواصل مع الدعم عبر واتساب</a> : <p className="hint">رقم الدعم قيد الإعداد.</p>}
      <p className="login-help">عندك حساب؟ <a href="/login">سجّل دخولك</a></p>
    </section> : <section className="card login-card" id="main-content" tabIndex={-1} aria-labelledby="signup-title">
      <h1 id="signup-title">ابدأ تجربتك المجانية</h1>
      <p>سجّل منشأتك في دقيقة، وجرّب كل المزايا ١٤ يوم مجانًا. بعد توثيق بريدك تنشأ منشأتك وتكون أنت المالك.</p>
      <SignupForm />
    </section>}
  </main></>;
}
