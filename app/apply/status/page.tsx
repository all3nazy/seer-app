import { Logo } from "../../../components/icons";
import { StatusForm } from "../../../components/apply-forms";

export const metadata = { title: "متابعة طلب الالتحاق", robots: { index: false } };

export default function ApplicationStatusPage() {
  return <main className="shell">
    <header className="top"><Logo /></header>
    <section className="card login-card" id="main-content" tabIndex={-1} aria-labelledby="status-title">
      <h1 id="status-title">متابعة طلب الالتحاق</h1>
      <p>اكتب رقم الطلب اللي وصلك بعد التقديم، ورقم الجوال اللي قدّمت فيه.</p>
      <StatusForm />
    </section>
  </main>;
}
