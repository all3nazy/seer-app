import Link from "next/link";
import { Logo } from "../components/icons";

export const metadata = { title: "الصفحة غير موجودة" };

/** Any unknown address, or a page whose record no longer exists: in Arabic, with the brand. */
export default function NotFound() {
  return <><a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a><main className="shell">
    <header className="top"><Logo /></header>
    <section className="card login-card not-found" id="main-content" tabIndex={-1} aria-labelledby="not-found-title">
      <p className="not-found-code" aria-hidden="true">٤٠٤</p>
      <h1 id="not-found-title">الصفحة غير موجودة</h1>
      <p>ممكن الرابط ناقص أو انتهت صلاحيته. إذا وصلك من المدرسة، اطلب منهم رابطًا جديدًا.</p>
      <div className="not-found-actions">
        <Link className="primary-button" href="/">الرئيسية</Link>
        <Link className="btn" href="/login">تسجيل الدخول</Link>
      </div>
    </section>
  </main></>;
}
