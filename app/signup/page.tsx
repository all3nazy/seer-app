import { Logo } from "../../components/icons";
import { SignupForm } from "../../components/signup-form";

export const metadata = { title: "ابدأ تجربتك المجانية", description: "سجّل مدرستك أو حضانتك في سِير وجرّب كل المزايا مجانًا." };

export default function SignupPage() {
  return <><a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a><main className="shell">
    <header className="top"><Logo /><nav aria-label="التنقل الرئيسي" style={{ display: "flex", gap: 8 }}><a className="btn" href="/pricing">الأسعار</a><a className="btn" href="/login">تسجيل الدخول</a></nav></header>
    <section className="card login-card" id="main-content" tabIndex={-1} aria-labelledby="signup-title">
      <h1 id="signup-title">ابدأ تجربتك المجانية</h1>
      <p>سجّل منشأتك في دقيقة، وجرّب كل المزايا ١٤ يوم مجانًا. بعد توثيق بريدك تنشأ منشأتك وتكون أنت المالك.</p>
      <SignupForm />
    </section>
  </main></>;
}
