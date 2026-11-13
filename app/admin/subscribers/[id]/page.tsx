import { notFound } from "next/navigation";
import { requestSession } from "../../../../lib/supabase/server";
import { SubscriberActions } from "../../../../components/admin-forms";
import { accessLabels, durationLabel, paymentStatusLabels, riyal, statusLabels, type Access } from "../../../../lib/subscriptions";
import { setupPercent, stepTitle, type SetupRow } from "../../../../lib/onboarding";
import { BackLink } from "../../../../components/back-link";

export const metadata = { title: "مشترك" };
type Detail = { organization_id: string; name: string; type: string; created_at: string; access: Access;
  subscription: { plan_id: string; status: string; starts_on: string; ends_on: string; admin_notes: string | null } | null; plan: { id: string; name: string } | null;
  owners: { name: string | null; email: string; phone: string | null }[]; students: number; staff: number;
  payments: { id: string; plan: string; months: number; amount: number; reference: string; status: string; reject_reason: string | null; created_at: string }[] };
const types: Record<string, string> = { school: "مدرسة", nursery: "حضانة", kindergarten: "روضة" };

export default async function AdminSubscriber({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { client } = await requestSession();
  const [detail, plans, setupResult] = await Promise.all([client.rpc("admin_subscriber", { org: id }), client.from("plans").select("id,name").order("sort_order"), client.rpc("admin_onboarding")]);
  const setup = ((setupResult.data ?? []) as SetupRow[]).find(row => row.organization_id === id) ?? null;
  const d = detail.data as Detail | null;
  if (!d) notFound();
  const s = d.subscription;
  return <>
    <BackLink href="/admin/subscribers" label="رجوع إلى المشتركين" />
    <header className="page-head"><div><h1>{d.name}</h1><p>{types[d.type] ?? d.type} · منذ {new Date(d.created_at).toLocaleDateString("ar-SA")}</p></div></header>
    <div className="stats">
      <div className="stat"><span className="figure">{s?.status === "trial" && d.access === "active" ? statusLabels.trial : s?.status === "suspended" ? statusLabels.suspended : accessLabels[d.access]}</span><span className="label">الحالة</span></div>
      <div className="stat"><span className="figure">{d.plan?.name ?? "—"}</span><span className="label">{s ? `${s.starts_on} ← ${s.ends_on}` : "بدون اشتراك"}</span></div>
      <div className="stat"><span className="figure">{Number(d.students).toLocaleString("ar-SA")} / {Number(d.staff).toLocaleString("ar-SA")}</span><span className="label">طلاب / فريق</span></div>
    </div>
    {setup ? <section className="card" style={{ marginTop: 16 }} aria-labelledby="setup-title"><h2 id="setup-title">التأسيس</h2>
      <p style={{ marginTop: 0 }}>{setup.completed_at ? "✓ خلّصوا التجهيز كله." : `أنجزوا ${setup.done.toLocaleString("ar-SA")} من ${setup.total.toLocaleString("ar-SA")} خطوات (${setupPercent(setup).toLocaleString("ar-SA")}٪).`}
        {setup.snooze_count ? ` أجّلوه ${setup.snooze_count.toLocaleString("ar-SA")} مرات.` : ""} {setup.stuck ? <span className="chip-soft rose">متعثرة</span> : null}</p>
      {setup.missing.length ? <><h3 style={{ fontSize: 15, margin: "8px 0" }}>الخطوات الناقصة</h3>
        <ul className="records">{setup.missing.map(step => <li key={step}>{stepTitle(step)}</li>)}</ul></> : null}
    </section> : null}
    <section className="card" style={{ marginTop: 16 }}><h2>التواصل</h2>
      <ul className="records">{d.owners.map((owner, index) => <li key={index}><span>{owner.name ?? "المالك"}</span><span dir="ltr" className="hint">{[owner.phone, owner.email].filter(Boolean).join(" · ")}</span></li>)}</ul>
    </section>
    <section className="card" style={{ marginTop: 16 }}><h2>إجراءات</h2>
      <SubscriberActions org={d.organization_id} plans={(plans.data ?? []) as { id: string; name: string }[]} currentPlan={s?.plan_id ?? null} suspended={s?.status === "suspended"} note={s?.admin_notes ?? null} />
    </section>
    <section className="card" style={{ marginTop: 16 }}><h2>سجل المدفوعات</h2>
      {d.payments.length ? <ul className="records">{d.payments.map(payment => <li key={payment.id}><span>{payment.plan} · {durationLabel(payment.months)} · {riyal(payment.amount)}<span className="hint" style={{ display: "block" }}>{payment.reference} · {new Date(payment.created_at).toLocaleDateString("ar-SA")}{payment.reject_reason ? ` · ${payment.reject_reason}` : ""}</span></span>
        <span className={`chip-soft ${payment.status === "approved" ? "ok" : payment.status === "rejected" ? "rose" : ""}`}>{paymentStatusLabels[payment.status]}</span></li>)}</ul> : <p className="empty">ما فيه مدفوعات.</p>}
    </section>
  </>;
}
