import Link from "next/link";
import { loadOrgContext } from "../../../../lib/org-context";
import { OrgUnavailable } from "../../../../components/org-unavailable";
import { PaymentSettingsForm, WebhookSecretForm } from "../../../../components/pay-forms";
import { intentStatusLabels, liveReady, payMethodLabels, providerLabels, type PayMethod, type Provider } from "../../../../lib/payments";
import { sar } from "../../../../lib/finance";
import { pilotMode, pilotTexts } from "../../../../lib/pilot";

export const dynamic = "force-dynamic";
export const metadata = { title: "الدفع الإلكتروني" };

export default async function OnlinePaymentsPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org: requested } = await searchParams;
  const context = await loadOrgContext(requested);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager } = context;
  if (pilotMode()) return <section className="card"><h1>الدفع الإلكتروني</h1><p>{pilotTexts.payments}</p></section>;
  if (!manager) return <section className="card"><h1>الدفع الإلكتروني</h1><p>لمالك المنشأة أو مديرها فقط.</p></section>;
  const [settingsResult, intentsResult, webhookResult] = await Promise.all([
    client.from("payment_settings").select("provider,mode,methods,publishable_key,is_enabled").eq("organization_id", org).maybeSingle(),
    client.from("payment_intents").select("id,amount,provider,mode,method,status,provider_ref,failure_reason,created_at,invoice_id").eq("organization_id", org).order("created_at", { ascending: false }).limit(50),
    client.rpc("payment_webhook_configured", { org }),
  ]);
  const webhookConfigured = (webhookResult.data ?? []) as string[];
  const settings = settingsResult.data as { provider: Provider; mode: string; methods: string[]; publishable_key: string | null; is_enabled: boolean } | null;
  const intents = (intentsResult.data ?? []) as { id: string; amount: number; provider: Provider; mode: string; method: PayMethod; status: string; provider_ref: string | null; failure_reason: string | null; created_at: string; invoice_id: string }[];
  const orgParam = encodeURIComponent(org);
  const webhook = settings && settings.provider !== "none" && settings.provider !== "sandbox";
  return <>
    <header className="page-head"><div>
      <p className="hint"><Link href={`/dashboard/finance?org=${orgParam}`}>المالية</Link> / الدفع الإلكتروني</p>
      <h1>الدفع الإلكتروني</h1><p>ولي الأمر يدفع فاتورته من رابطها: مدى، فيزا وماستركارد، Apple Pay، STC Pay، تابي وتمارا. الدفعة تنسجل تلقائيًا في فواتير {orgName} بإيصالها.</p>
    </div></header>
    <div className="home-grid">
      <section className="card"><h2>الإعدادات</h2><PaymentSettingsForm organizationId={org} settings={settings} /></section>
      <section className="card"><h2>خطوات التفعيل الحقيقي</h2>
        <ol className="steps">
          <li>جرّب الآن بـ«وضع التجربة»: افتح رابط أي فاتورة صادرة واضغط «ادفع الآن». المحاولات التجريبية ما تدخل الحسابات.</li>
          <li>اشترك مع بوابة دفع سعودية (ميسّر جاهزة في المنصة؛ HyperPay وTap وPayTabs تنضاف بنفس الطريقة).</li>
          <li>حط المفتاح العام هنا، والصق رمز الـWebhook الخاص بحسابكم في الخانة تحت (ينحفظ مشفّرًا ولا يظهر لأحد).</li>
          <li>اربط رابط الإشعارات في لوحة البوابة: <code dir="ltr">/api/payments/webhook/{settings?.provider && settings.provider !== "none" && settings.provider !== "sandbox" ? settings.provider : "moyasar"}</code></li>
          <li>جرّب بمفاتيح الاختبار، ثم حوّل الوضع إلى «حقيقي».</li>
        </ol>
        {webhook && !liveReady.includes(settings!.provider) ? <p className="info-banner">بوابة {providerLabels[settings!.provider]} محفوظة، وربطها يكتمل لما يتوفر حسابها. حاليًا ميسّر هي الجاهزة.</p> : null}
        {webhook ? <WebhookSecretForm organizationId={org} gateway={settings!.provider} configured={webhookConfigured.includes(settings!.provider)} /> : null}
      </section>
    </div>
    <section className="card" style={{ marginTop: 16 }}><h2>محاولات الدفع</h2>
      {intents.length ? <div className="table-wrap"><table className="links-table" style={{ width: "100%" }}><thead><tr><th>الوقت</th><th>المبلغ</th><th>الطريقة</th><th>البوابة</th><th>الحالة</th><th></th></tr></thead>
        <tbody>{intents.map(item => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" })}</td><td>{sar(item.amount)}</td><td>{payMethodLabels[item.method]}</td>
          <td>{providerLabels[item.provider]}{item.mode === "test" ? " · تجريبي" : ""}</td><td><span className={`chip-soft ${item.status === "paid" ? "ok" : item.status === "failed" || item.status === "needs_review" ? "rose" : ""}`}>{intentStatusLabels[item.status] ?? item.status}</span>{item.status === "needs_review" && item.failure_reason ? <small className="hint" style={{ display: "block" }}>{item.failure_reason}</small> : null}</td>
          <td><Link href={`/dashboard/finance/invoices/${item.invoice_id}?org=${orgParam}`}>الفاتورة</Link></td></tr>)}</tbody></table></div> : <p className="empty">ما فيه محاولات دفع بعد.</p>}
    </section>
  </>;
}
