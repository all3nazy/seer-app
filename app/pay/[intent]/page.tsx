import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { MoyasarForm, SandboxCheckout } from "../../../components/pay-forms";
import { onColor } from "../../../lib/documents";
import { sar } from "../../../lib/finance";
import { payMethodLabels, providerLabels, toHalalas, type PayMethod, type Provider } from "../../../lib/payments";
import { siteOrigin } from "../../../lib/origin";

export const dynamic = "force-dynamic";
export const metadata = { title: "الدفع", robots: { index: false, follow: false } };
const isUuid = (value: string | undefined) => Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
type View = { id: string; amount: number; status: string; provider: Provider; mode: string; method: PayMethod; invoice_number: number | null; invoice_title: string | null; organization: string; brand_color: string; logo_data: string | null; publishable_key: string | null };

/** Checkout for one payment attempt, reached from the family's invoice link. */
export default async function PayPage({ params, searchParams }: { params: Promise<{ intent: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ intent }, { t: token }] = await Promise.all([params, searchParams]);
  if (!isUuid(intent) || !isUuid(token)) notFound();
  const client = await createSupabaseServerClient();
  const { data } = await client.rpc("payment_intent_view", { token, intent });
  if (!data) notFound();
  const view = data as View;
  const publishableKey = view.provider === "moyasar" ? view.publishable_key : null;
  const brand = /^#[0-9A-Fa-f]{6}$/.test(view.brand_color) ? view.brand_color : "#3E1657";
  const back = `/d/${token}`;
  const done = view.status === "paid";
  return <main className="portal" style={{ ["--brand" as string]: brand, ["--on-brand" as string]: onColor(brand) }}>
    <header className="portal-head">
      {view.logo_data ? <img src={view.logo_data} alt="" className="fdoc-logo" /> : <span className="fdoc-monogram" aria-hidden="true">{view.organization.charAt(0)}</span>}
      <div><span>الدفع الإلكتروني</span><strong>{view.organization}</strong><span>{view.invoice_number ? `فاتورة ${view.invoice_number}` : "فاتورة"}{view.invoice_title ? ` — ${view.invoice_title}` : ""}</span></div>
    </header>
    <section className="portal-section">
      <div className="portal-card pay-summary">
        <span>المبلغ</span><strong>{sar(view.amount)}</strong><span>{payMethodLabels[view.method]} · {providerLabels[view.provider]}{view.mode === "test" ? " · تجريبي" : ""}</span>
      </div>
      {done ? <div className="portal-card pay-result ok"><strong>✓ تم الدفع</strong><span>{view.provider === "sandbox" ? "عملية تجريبية: ما انخصم أي مبلغ وما تغيّرت الفاتورة." : "شكرًا لكم. وصل الإيصال للمدرسة وتحدّثت الفاتورة."}</span></div>
        : view.status === "cancelled" || view.status === "failed" ? <div className="portal-card pay-result bad"><strong>{view.status === "failed" ? "ما تمت العملية" : "أُلغيت العملية"}</strong><span>تقدرون ترجعون للفاتورة وتحاولون مرة ثانية.</span></div>
        : view.provider === "sandbox" ? <div className="portal-card"><p>هذي صفحة دفع تجريبية لتجربة الخطوات قبل الاشتراك مع بوابة الدفع.</p><SandboxCheckout token={token!} intent={intent} /></div>
        : view.provider === "moyasar" && publishableKey ? <div className="portal-card"><MoyasarForm publishableKey={publishableKey} amountHalalas={toHalalas(view.amount)} description={`${view.organization} — فاتورة ${view.invoice_number ?? ""}`} intent={intent}
            callbackUrl={`${await siteOrigin()}/pay/${intent}?t=${token}`} methods={view.method === "apple_pay" ? ["applepay"] : view.method === "stc_pay" ? ["stcpay"] : ["creditcard"]} /></div>
        : <div className="portal-card pay-result"><strong>بوابة الدفع قيد التفعيل</strong><span>المدرسة جهّزت الدفع الإلكتروني وربط {providerLabels[view.provider]} يكتمل قريبًا. تقدرون تحوّلون على الآيبان الموجود في الفاتورة.</span></div>}
      <p style={{ textAlign: "center" }}><Link className="btn" href={back}>الرجوع للفاتورة</Link></p>
    </section>
  </main>;
}
