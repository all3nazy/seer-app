import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Icon, Logo } from "../components/icons";
import { LandingPreviews } from "../components/landing-previews";
import { joinMailto, landing, landingFeatures, landingSecurity, landingSteps } from "../lib/landing";
import { pilotMode } from "../lib/pilot";
import { canonicalHost } from "../lib/canonical";
import { supportEmail } from "../lib/support";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const host = canonicalHost() ?? process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "seersa.vercel.app";
  const title = `سِير — ${landing.title}`;
  return {
    metadataBase: new URL(`https://${host}`),
    title: { absolute: title },
    description: landing.description,
    alternates: { canonical: "/" },
    openGraph: { type: "website", locale: "ar_SA", siteName: "سِير", url: "/", title, description: landing.description },
    twitter: { card: "summary_large_image", title, description: landing.description },
  };
}

/**
 * The public home page. Drawn without images or extra libraries; light and dark follow the device.
 * Signed in: «ادخل لوحتك» (seen from the session cookie only, no request). Pilot: joining by invitation.
 */
export default async function Home() {
  const pilot = pilotMode();
  const signedIn = (await cookies()).getAll().some(cookie => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name));
  return <><a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a>
  <div className="lp">
    <header className="lp-top">
      <Logo />
      <nav aria-label="التنقل الرئيسي" className="lp-nav">
        {pilot ? null : <a className="btn" href="/pricing">الأسعار</a>}
        {signedIn ? <a className="btn btn-primary" href="/dashboard">ادخل لوحتك</a> : <a className="btn" href="/login">تسجيل الدخول</a>}
      </nav>
    </header>

    <main id="main-content" tabIndex={-1}>
      <section className="lp-hero" aria-labelledby="home-title">
        <span className="lp-hello">{landing.welcome}</span>
        <h1 id="home-title">{landing.title}</h1>
        <p>{landing.lead[0]}<br />{landing.lead[1]}</p>
        <span className="lp-badge">{landing.badge}</span>
        <div className="lp-actions">
          {signedIn ? <a className="lp-btn light" href="/dashboard">ادخل لوحتك</a> : <a className="lp-btn light" href="/login">عندي دعوة، سجّل دخولي</a>}
          {pilot ? <a className="lp-btn outline" href="#join">أبي أنضم للتجربة</a> : <a className="lp-btn outline" href="/signup">ابدأ تجربتك</a>}
        </div>
      </section>

      <section className="lp-section" aria-labelledby="features-title">
        <h2 id="features-title">وش تلقون في سِير</h2>
        <div className="lp-features">{landingFeatures.map(item => <article className="lp-feature" key={item.title}>
          <span className={`tile-icon tone-${item.tone}`}><Icon name={item.icon} /></span>
          <h3>{item.title}</h3><p>{item.text}</p>
        </article>)}</div>
      </section>

      <section className="lp-section" aria-labelledby="inside-title">
        <h2 id="inside-title">شوف سِير من الداخل</h2>
        <p className="lp-sub">شاشات من المنصة على الجوال، ببيانات توضيحية.</p>
        <LandingPreviews />
      </section>

      <section className="lp-section" aria-labelledby="steps-title">
        <h2 id="steps-title">ثلاث خطوات وتبدأون</h2>
        <ol className="lp-steps">{landingSteps.map((step, index) => <li key={step.title}>
          <span className="lp-step-n" aria-hidden="true">{(index + 1).toLocaleString("ar-SA")}</span>
          <div><h3>{step.title}</h3><p>{step.text}</p></div>
        </li>)}</ol>
      </section>

      <section className="lp-section" aria-labelledby="safe-title">
        <h2 id="safe-title">بياناتكم في أمان</h2>
        <div className="lp-safe">{landingSecurity.map(item => <div key={item.title}>
          <span className="lp-safe-icon"><Icon name={item.icon} /></span><h3>{item.title}</h3><p>{item.text}</p>
        </div>)}</div>
        <p className="lp-sub"><Link href="/privacy">اقرأ سياسة الخصوصية</Link></p>
      </section>

      <section className="lp-join" id="join" aria-labelledby="join-title">
        <h2 id="join-title">{pilot ? "تبي تنضم للتجربة؟" : "عندكم سؤال قبل ما تبدأون؟"}</h2>
        <p>{pilot ? "سِير حاليًا بدعوة لعدد محدود من المدارس والحضانات. اكتب لنا ونرسل لكم رابط الدعوة." : "اكتب لنا ونرد عليكم، أو ابدأوا تجربتكم المجانية مباشرة."}</p>
        <a className="lp-btn light" href={joinMailto}>راسلنا على البريد</a>
        <span className="lp-mail" dir="ltr">{supportEmail}</span>
      </section>
    </main>

    <footer className="lp-foot legal-links">
      <span>سِير، منصة سعودية للمدارس والحضانات.</span>
      <nav aria-label="روابط">
        <Link href="/privacy">سياسة الخصوصية</Link>
        <Link href="/terms">شروط الاستخدام</Link>
        {pilot ? null : <Link href="/pricing">الأسعار</Link>}
        <a href={`mailto:${supportEmail}`} dir="ltr">{supportEmail}</a>
      </nav>
    </footer>
  </div></>;
}
