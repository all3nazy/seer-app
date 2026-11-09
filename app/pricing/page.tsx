import { Logo } from "../../components/icons";
import { PricingTable } from "../../components/pricing-table";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import type { Duration, Plan } from "../../lib/subscriptions";

export const dynamic = "force-dynamic";
export const metadata = { title: "الباقات والأسعار", description: "باقات سِير للمدارس والحضانات: قارن المزايا والمدد والأسعار، وابدأ تجربة مجانية." };

/** Public pricing: the plans, what each includes, and the price for each duration. */
export default async function PricingPage() {
  type Pricing = { plans: Plan[]; durations: Duration[]; trial_days: number };
  const data: Pricing | null = await createSupabaseServerClient().then(client => client.rpc("pricing")).then(result => (result.data ?? null) as Pricing | null).catch(() => null);
  const trial = data?.trial_days ?? 14;
  return <><a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a><main className="shell pricing">
    <header className="top"><Logo /><nav aria-label="التنقل الرئيسي" style={{ display: "flex", gap: 8 }}><a className="btn" href="/login">تسجيل الدخول</a><a className="primary-button" href="/signup">جرّب مجانًا</a></nav></header>
    <section className="hero-center" id="main-content" tabIndex={-1} aria-labelledby="pricing-title">
      <h1 id="pricing-title">باقات سِير</h1>
      <p>ابدأ بتجربة مجانية {trial.toLocaleString("ar-SA")} يوم بكل المزايا، بدون بطاقة. بعدها اختر الباقة والمدة اللي تناسب منشأتك، وادفع بتحويل بنكي.</p>
    </section>
    {data?.plans?.length ? <PricingTable plans={data.plans} durations={data.durations} /> : <p className="info-banner" role="status" style={{ textAlign: "center" }}>تعذر تحميل الأسعار الآن. حدّث الصفحة بعد قليل.</p>}
    <section className="card" style={{ marginTop: 24 }} aria-labelledby="faq-title">
      <h2 id="faq-title">أسئلة شائعة</h2>
      <dl className="faq">
        <dt>وش يصير بعد التجربة؟</dt><dd>تختار باقتك وتحوّل المبلغ، وترفع الإيصال من صفحة الاشتراك. بعد الاعتماد يستمر كل شيء بدون انقطاع.</dd>
        <dt>إذا تأخرت في التجديد؟</dt><dd>تشتغل المنصة في مهلة التجديد، وبعدها تنقفل مؤقتًا. بياناتك محفوظة بالكامل وتنفتح مباشرة بعد التجديد.</dd>
        <dt>أقدر أغيّر الباقة؟</dt><dd>نعم، اختر الباقة الجديدة عند التجديد، أو تواصل معنا للترقية في أي وقت.</dd>
      </dl>
    </section>
    <footer className="foot">سِير، منصة إدارة عمليات المدارس والحضانات.</footer>
  </main></>;
}
