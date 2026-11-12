import Link from "next/link";
import { loadOrgContext } from "../../../lib/org-context";
import { OrgUnavailable } from "../../../components/org-unavailable";
import { BillingPanel } from "../../../components/billing-panel";
import { pilotMode, pilotTexts } from "../../../lib/pilot";
import { supportLink } from "../../../lib/support";
import { accessLabels, durationLabel, paymentStatusLabels, riyal, statusLabels, type Access, type Duration, type Plan } from "../../../lib/subscriptions";

export const dynamic = "force-dynamic";
export const metadata = { title: "الاشتراك" };

type Overview = { access: Access; status: string | null; starts_on: string | null; ends_on: string | null; days_left: number | null; grace_days: number; owner: boolean;
  plan: { id: string; key: string; name: string; features: string[]; monthly_price: number } | null; bank_accounts: { bank: string; holder: string; iban: string }[];
  payments: { id: string; plan: string; months: number; amount: number; reference: string; status: string; reject_reason: string | null; created_at: string; decided_at: string | null; period_end: string | null }[] };

/** The subscription: state, renewal by bank transfer, and the history of transfers. Works while locked. */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ org?: string; locked?: string; upgrade?: string }> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName } = context;
  const [overview, pricing] = await Promise.all([client.rpc("billing_overview", { org }), client.rpc("pricing")]);
  const data = overview.data as Overview | null;
  if (!data) return <section className="card"><h1>الاشتراك</h1><p>تعذر تحميل بيانات الاشتراك. حدّث الصفحة.</p></section>;
  const prices = (pricing.data ?? { plans: [], durations: [] }) as { plans: Plan[]; durations: Duration[] };
  const locked = data.access === "locked";
  const pilot = pilotMode();
  const support = supportLink(process.env.SEER_SUPPORT_WHATSAPP ?? "");
  const days = data.days_left ?? 0;
  return <div style={{ maxWidth: 900 }}>
    <header className="page-head"><div><h1>الاشتراك</h1><p>{orgName}</p></div></header>
    {locked ? <section className="card lock-card" role="alert">
      <h2 style={{ margin: 0 }}>{data.status === "suspended" ? "اشتراك المنشأة موقوف" : "انتهى الاشتراك وانقفلت المنصة مؤقتًا"}</h2>
      <p style={{ margin: 0 }}>كل بياناتك محفوظة بالكامل: الطلاب والحضور والفواتير وكل السجلات. بمجرد اعتماد التجديد تنفتح المنصة مباشرة لك ولفريقك.</p>
      {pilot ? <p style={{ margin: 0 }}><strong>تواصل مع فريق سِير لتمديد فترتك التجريبية.</strong>{support ? <> <a href={support} target="_blank" rel="noopener noreferrer">الدعم عبر واتساب</a></> : null}</p>
        : !data.owner ? <p style={{ margin: 0 }}><strong>التجديد من صلاحية مالك المنشأة.</strong> تواصل معه ليجدد الاشتراك.</p> : null}
    </section> : null}
    {pilot ? <p className="info-banner" role="status">{pilotTexts.billing}. ما تحتاج تحوّل أي مبلغ، وكل الأقسام مفتوحة لمنشأتك.</p> : null}
    {params.upgrade && !pilot ? <p className="info-banner">هذا القسم مو ضمن باقتك الحالية. اختر الباقة المتقدمة عند التجديد لتفعيله.</p> : null}
    <div className="stats">
      <div className={`stat ${locked ? "peach" : data.access === "grace" ? "peach" : "sky"}`}><span className="figure">{data.status === "trial" && !locked ? statusLabels.trial : accessLabels[data.access]}</span><span className="label">الحالة</span></div>
      <div className="stat"><span className="figure">{data.plan?.name ?? "—"}</span><span className="label">الباقة</span></div>
      <div className="stat"><span className="figure">{locked ? "—" : data.access === "grace" ? `${Math.max(data.grace_days + days, 0).toLocaleString("ar-SA")} يوم` : `${Math.max(days, 0).toLocaleString("ar-SA")} يوم`}</span>
        <span className="label">{data.access === "grace" ? "باقي من المهلة" : `متبقٍ حتى ${data.ends_on ?? ""}`}</span></div>
    </div>
    {data.owner && !pilot ? <BillingPanel organizationId={org} plans={prices.plans} durations={prices.durations} currentPlan={data.plan?.id ?? null} accounts={data.bank_accounts} /> : null}
    {data.owner ? <section className="card" style={{ marginTop: 16 }}><h2>طلباتك</h2>
      {data.payments.length ? <ul className="records">{data.payments.map(payment => <li key={payment.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span>{payment.plan} · {durationLabel(payment.months)} · {riyal(payment.amount)}<span className="hint" style={{ display: "block" }}>مرجع {payment.reference} · {new Date(payment.created_at).toLocaleDateString("ar-SA")}{payment.reject_reason ? ` · السبب: ${payment.reject_reason}` : ""}</span></span>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={`chip-soft ${payment.status === "approved" ? "ok" : payment.status === "rejected" ? "rose" : ""}`}>{paymentStatusLabels[payment.status] ?? payment.status}</span>
          {payment.status === "approved" ? <Link className="btn btn-sm" href={`/dashboard/billing/receipt/${payment.id}?org=${encodeURIComponent(org)}`}>إيصال الاشتراك</Link> : null}
        </span>
      </li>)}</ul> : <p className="empty">ما فيه طلبات بعد.</p>}
    </section> : null}
  </div>;
}
