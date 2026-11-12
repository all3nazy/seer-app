import { Logo } from "../../components/icons";
import { PricingTable } from "../../components/pricing-table";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { featureKeys, featureLabels, type Duration, type Plan } from "../../lib/subscriptions";
import { pilotHides, pilotMode, pilotTexts } from "../../lib/pilot";
import { supportEmail, supportMailto } from "../../lib/support";
import { LegalFooter } from "../../components/legal-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "الباقات والأسعار", description: "باقات سِير للمدارس والحضانات: قارن المزايا والمدد والأسعار، وابدأ تجربة مجانية." };

/** Public pricing: the plans, what each includes, and the price for each duration. */
export default async function PricingPage() {
  if (pilotMode()) return <PilotPricing />;
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
    <LegalFooter />
  </main></>;
}

/** During the pilot: free for everyone, no prices; joining is by invitation. */
function PilotPricing() {
  return <><a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a><main className="shell pricing">
    <header className="top"><Logo /><nav aria-label="التنقل الرئيسي" style={{ display: "flex", gap: 8 }}><a className="btn" href="/login">تسجيل الدخول</a><a className="primary-button" href={supportMailto}>تواصل معنا</a></nav></header>
    <section className="hero-center" id="main-content" tabIndex={-1} aria-labelledby="pricing-title">
      <h1 id="pricing-title">{pilotTexts.pricing}</h1>
      <p>كل الأقسام مفتوحة للمدارس والحضانات المشاركة بدون أي رسوم ولا بيانات دفع. الانضمام حاليًا بدعوة، وقبل أي اشتراك مدفوع نبلغك قبلها بـ٣٠ يومًا، وما يتحول أحد للدفع بدون موافقته.</p>
      <p>للانضمام راسلنا على <a href={supportMailto} dir="ltr">{supportEmail}</a></p>
    </section>
    <section className="card" aria-labelledby="included-title">
      <h2 id="included-title">المتاح خلال المرحلة التجريبية</h2>
      <ul className="plan-features">
        <li>✓ الطلاب والحضور ومتابعة الفصول والفريق</li>
        {featureKeys.filter(key => !pilotHides(key)).map(key => <li key={key}>✓ {featureLabels[key]}</li>)}
      </ul>
    </section>
    <LegalFooter />
  </main></>;
}
