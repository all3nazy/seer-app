import { notFound } from "next/navigation";
import { loadOrgContext } from "../../../../../lib/org-context";
import { OrgUnavailable } from "../../../../../components/org-unavailable";
import { PrintButton } from "../../../../../components/print-button";
import { Logo } from "../../../../../components/icons";
import { durationLabel, riyal } from "../../../../../lib/subscriptions";
import { BackLink } from "../../../../../components/back-link";

export const dynamic = "force-dynamic";
export const metadata = { title: "إيصال الاشتراك" };

/** The subscription receipt for an approved transfer (owner only; RLS decides). */
export default async function SubscriptionReceipt({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ org?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const context = await loadOrgContext((await searchParams).org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName } = context;
  const { data } = await client.from("subscription_payments").select("id,months,amount,reference,status,decided_at,period_start,period_end,created_at,plans(name)").eq("id", id).maybeSingle();
  if (!data || data.status !== "approved") notFound();
  const plan = (data.plans as unknown as { name: string } | null)?.name ?? "";
  return <article className="card sub-receipt" style={{ maxWidth: 640, margin: "0 auto", display: "grid", gap: 14 }}>
    <span className="no-print"><BackLink href={`/dashboard/billing?org=${encodeURIComponent(org)}`} label="رجوع إلى الاشتراك" /></span>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Logo /><span className="no-print"><PrintButton /></span></header>
    <h1 style={{ margin: 0 }}>إيصال اشتراك</h1>
    <dl className="field-row">
      <div><dt>المنشأة</dt><dd>{orgName}</dd></div>
      <div><dt>الباقة</dt><dd>{plan} · {durationLabel(data.months as number)}</dd></div>
      <div><dt>المبلغ</dt><dd>{riyal(Number(data.amount))}</dd></div>
      <div><dt>مرجع التحويل</dt><dd dir="ltr">{data.reference as string}</dd></div>
      <div><dt>فترة الاشتراك</dt><dd>{data.period_start as string} ← {data.period_end as string}</dd></div>
      <div><dt>تاريخ الاعتماد</dt><dd>{data.decided_at ? new Date(data.decided_at as string).toLocaleDateString("ar-SA") : ""}</dd></div>
      <div><dt>رقم الإيصال</dt><dd dir="ltr">{(data.id as string).slice(0, 8).toUpperCase()}</dd></div>
    </dl>
    <p className="hint" style={{ margin: 0 }}>صادر من منصة سِير لإدارة المدارس والحضانات.</p>
  </article>;
}
