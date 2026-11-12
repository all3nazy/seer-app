import { loadOrgContext } from "../../../lib/org-context";
import { requestPlatformAdmin } from "../../../lib/supabase/server";
import { OrgSwitcher, OrgUnavailable } from "../../../components/org-unavailable";
import { MessageSettingsForm, OutboxActions } from "../../../components/message-forms";
import { dispatchReady, messageKindLabels, messageProviderLabels, messageStatusLabels, type MessageProvider } from "../../../lib/messaging";

export const dynamic = "force-dynamic";
export const metadata = { title: "الرسائل" };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ org?: string; status?: string }> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager, organizations } = context;
  const status = ["queued", "sent", "failed", "skipped"].includes(params.status ?? "") ? params.status! : "queued";
  const [settingsResult, outbox, counts, platformAdmin] = await Promise.all([
    client.from("message_settings").select("provider,channel,sender_name,site_url,notify_absence,notify_late,notify_pickup,confirm_pickup,notify_bus,notify_invoice,notify_daily_report").eq("organization_id", org).maybeSingle(),
    client.from("message_outbox").select("id,to_phone,to_name,kind,body,status,created_at,last_error").eq("organization_id", org).eq("status", status).order("created_at", { ascending: false }).limit(100),
    client.from("message_outbox").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "queued"),
    requestPlatformAdmin(),
  ]);
  const settings = settingsResult.data as Record<string, string | boolean | null> | null;
  const rows = (outbox.data ?? []) as { id: string; to_phone: string; to_name: string | null; kind: string; body: string; status: string; created_at: string; last_error: string | null }[];
  const provider = (settings?.provider ?? "manual") as MessageProvider;
  return <>
    <header className="page-head">
      <div><h1>الرسائل</h1><p>رسائل {orgName} التلقائية لأولياء الأمور: الغياب والتأخير والانصراف وتأكيد الاستلام والباص والفواتير.</p></div>
      <OrgSwitcher path="/dashboard/messages" current={org} organizations={organizations} />
    </header>
    {!settings ? <p className="info-banner" style={{ marginBottom: 16 }}>الرسائل التلقائية متوقفة. {manager ? "فعّلها من الإعدادات تحت." : "يفعّلها مدير المنشأة."}</p>
      : provider === "manual" ? <p className="info-banner" style={{ marginBottom: 16 }}>الإرسال يدوي حاليًا: الرسائل تتجمّع هنا، وكل رسالة ترسلها بضغطة من واتساب جوالك. بعد الاشتراك مع مزوّد تنرسل تلقائيًا.</p>
      : <p className="info-banner" style={{ marginBottom: 16 }}>الإرسال التلقائي عبر {messageProviderLabels[provider]}{dispatchReady.includes(provider) ? "" : " (يكتمل ربطه عند توفر الحساب)"}.</p>}
    <nav className="segments" style={{ marginBottom: 14 }}>{["queued", "sent", "failed", "skipped"].map(key => <a key={key} href={`/dashboard/messages?org=${encodeURIComponent(org)}&status=${key}`} aria-current={key === status ? "page" : undefined}>{messageStatusLabels[key]}{key === "queued" && counts.count ? ` (${counts.count.toLocaleString("ar-SA")})` : ""}</a>)}</nav>
    <section className="card" style={{ marginBottom: 16 }}>
      {rows.length ? <ul className="records">{rows.map(row => <li key={row.id}>
        <span><span className="chip-soft">{messageKindLabels[row.kind] ?? row.kind}</span> <strong>{row.to_name ?? ""}</strong> <span dir="ltr" className="hint">{row.to_phone}</span>
          <span className="hint" style={{ display: "block", whiteSpace: "pre-wrap" }}>{row.body}</span>
          {row.last_error ? <span className="form-error" style={{ display: "block" }}>{row.last_error}</span> : null}</span>
        <OutboxActions id={row.id} phone={row.to_phone} body={row.body} status={row.status} />
      </li>)}</ul> : <p className="empty">ما فيه رسائل {messageStatusLabels[status]}.</p>}
    </section>
    {manager ? <section className="card"><details open={!settings}><summary><strong>إعدادات الرسائل</strong></summary><div style={{ marginTop: 12 }}><MessageSettingsForm organizationId={org} settings={settings} /></div>
      {platformAdmin
        ? <p className="hint" style={{ marginTop: 12 }}>لمسؤول المنصة: للإرسال التلقائي اشترك مع المزوّد، وأضف مفاتيحه في إعدادات الخادم (TAQNYAT_API_KEY أو WHATSAPP_TOKEN وWHATSAPP_PHONE_NUMBER_ID)، وجدول استدعاء <span dir="ltr">/api/messages/dispatch</span> كل دقائق بالرمز CRON_SECRET.</p>
        : <p className="hint" style={{ marginTop: 12 }}>الإرسال التلقائي برسائل الجوال أو واتساب يفعّله فريق سِير لمنشأتك. تواصل مع الدعم وحنا نجهزه لك.</p>}</details></section> : null}
  </>;
}
