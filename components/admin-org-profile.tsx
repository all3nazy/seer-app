import Link from "next/link";
import { EntitlementsForm, FreeMonthButton, MemberActions, NoteEditor, OrgHeaderActions, OrgTabs, RemindButton, type OrgMember } from "./admin-org";
import { auditLabel, dayCount, statusPill, timeAgo } from "../lib/admin-format";
import { arNumber, formatDate } from "../lib/dates";
import { durationLabel, paymentStatusLabels, riyal } from "../lib/subscriptions";
import { stepTitle } from "../lib/onboarding";
import { orgTypeLabels } from "../lib/org-invites";

export type OrgProfile = {
  organization_id: string; name: string; type: string; city: string | null; created_at: string; access: string;
  subscription: { status: string; starts_on: string; ends_on: string; days_left: number; plan_id: string; cancelled_at: string | null; cancel_reason: string | null } | null;
  plan: { id: string; name: string; monthly_price: number; features: string[] } | null;
  grace_days: number; payment_method: string | null;
  payments: { id: string; plan: string | null; months: number; amount: number; reference: string; status: string; reject_reason: string | null; receipt_path: string; created_at: string; decided_at: string | null; period_end: string | null }[];
  members: (OrgMember & { phone: string | null })[];
  counts: { staff: number; signed_in_today: number; guardians: number; students: number };
  entitlements: { blocked: string[]; disabled: string[] };
  onboarding: { done: number; total: number; missing: string[]; snooze_count: number; stuck: boolean; completed_at: string | null; since: string | null } | null;
  support: { id: string; subject: string; status: string; last_sender: string; last_message_at: string }[];
  log: { action: string; detail: Record<string, unknown>; created_at: string }[];
  note: { body: string; updated_at: string } | null;
};

const roleLabels: Record<string, string> = { owner: "المالك", admin: "مدير", staff: "موظف" };
const row = (label: string, value: React.ReactNode) => <div className="adm-row"><span>{label}</span><span>{value}</span></div>;

/** «ملف منشأة» (approved design): header with the actions, then the tabs. Data from admin_org_profile(). */
export function OrgProfileView({ profile: p, plans, receipts, now = Date.now() }: { profile: OrgProfile; plans: { id: string; name: string }[]; receipts: Record<string, string | null>; now?: number }) {
  const s = p.subscription;
  const pill = statusPill(s?.status, p.access);
  const owner = p.members.find(member => member.role === "owner");
  const stuckStep = p.onboarding && !p.onboarding.completed_at ? p.onboarding.missing[0] : null;
  const stuckDays = p.onboarding?.since ? Math.max(0, Math.floor((now - Date.parse(p.onboarding.since)) / 86_400_000)) : 0;
  const openTickets = p.support.filter(thread => thread.status === "open");
  const setup = p.onboarding ? <div style={{ display: "grid", gap: 10 }}>
    <div className="adm-progress-row"><div className="adm-progress" role="progressbar" aria-valuemin={0} aria-valuemax={p.onboarding.total} aria-valuenow={p.onboarding.done} aria-label="تقدّم التأسيس">
      <div style={{ width: `${p.onboarding.total ? Math.round(100 * p.onboarding.done / p.onboarding.total) : 0}%` }} /></div>
      <strong>{arNumber(p.onboarding.done)} من {arNumber(p.onboarding.total)}</strong></div>
    {p.onboarding.completed_at ? <p style={{ margin: 0 }}>✓ خلّصوا التجهيز كله.</p> : <>
      <p style={{ margin: 0 }}>باقي: {p.onboarding.missing.map(stepTitle).join("، ")}.</p>
      {stuckStep ? <p className={`hint${p.onboarding.stuck ? " adm-warn" : ""}`} style={{ margin: 0 }}>واقف عند «{stepTitle(stuckStep)}» من {dayCount(stuckDays)}{p.onboarding.snooze_count ? ` · أجّلوه ${arNumber(p.onboarding.snooze_count)} مرات` : ""}</p> : null}
      <span><RemindButton org={p.organization_id} /></span>
    </>}
  </div> : <p className="empty">ما فيه بيانات تأسيس بعد.</p>;
  const supportList = p.support.length ? <ul className="adm-list">{p.support.map(thread => <li key={thread.id}>
    <Link href={`/admin/support/${thread.id}`}>{thread.subject}</Link>
    <span className={`chip-soft ${thread.status === "closed" ? "ok" : thread.last_sender === "user" ? "coral" : ""}`}>{thread.status === "closed" ? "انحلت" : thread.last_sender === "user" ? "بانتظار ردك" : "رديت عليها"}</span>
  </li>)}</ul> : <p className="empty">ما عندهم تذاكر دعم.</p>;

  const tabs = [
    { id: "overview", label: "نظرة", content: <div className="adm-grid">
      <section className="card adm-card" aria-labelledby="sum-sub"><h2 id="sum-sub">الاشتراك</h2>
        {row("الباقة", p.plan ? `${p.plan.name} · ${riyal(p.plan.monthly_price)} شهريًا` : "—")}
        {row("طريقة الدفع", p.payment_method === "bank_transfer" ? "تحويل بنكي" : "ما فيه دفعات مؤكدة")}
        {row("التجديد القادم", s ? formatDate(`${s.ends_on}T12:00:00Z`, { year: true }) : "—")}
        {row("مهلة السداد بعد الانتهاء", dayCount(p.grace_days))}
        <div className="adm-btn-row" style={{ marginTop: 10 }}><FreeMonthButton org={p.organization_id} /></div>
      </section>
      <section className="card adm-card" aria-labelledby="sum-setup"><h2 id="sum-setup">التأسيس</h2>{setup}</section>
      <section className="card adm-card" aria-labelledby="sum-users"><h2 id="sum-users">المستخدمين</h2>
        {row("المالك", owner ? owner.name || owner.login : "—")}
        {row("الفريق", `${arNumber(p.counts.staff)} · دخل اليوم ${arNumber(p.counts.signed_in_today)}`)}
        {row("أولياء الأمور", arNumber(p.counts.guardians))}
        {row("الطلاب", arNumber(p.counts.students))}
        {row("آخر دخول للمالك", owner?.last_sign_in_at ? timeAgo(owner.last_sign_in_at, now) : "ما دخل بعد")}
      </section>
      <section className="card adm-card" aria-labelledby="sum-support"><h2 id="sum-support">الدعم</h2>
        {openTickets.length ? <p className="hint" style={{ marginTop: 0 }}>{arNumber(openTickets.length)} مفتوحة</p> : null}{supportList}</section>
      <section className="card adm-card" aria-labelledby="sum-note"><h2 id="sum-note">ملاحظاتك الخاصة</h2><NoteEditor org={p.organization_id} body={p.note?.body ?? ""} /></section>
    </div> },
    { id: "billing", label: "الاشتراك والفواتير", content: <div style={{ display: "grid", gap: 16 }}>
      <section className="card adm-card" aria-labelledby="bill-sub"><h2 id="bill-sub">الاشتراك</h2>
        {row("الباقة", p.plan?.name ?? "—")}
        {row("الحالة", pill.label)}
        {row("بدأ", s ? formatDate(`${s.starts_on}T12:00:00Z`, { year: true }) : "—")}
        {row("ينتهي", s ? `${formatDate(`${s.ends_on}T12:00:00Z`, { year: true })}${s.days_left >= 0 ? ` (باقي ${dayCount(s.days_left)})` : ""}` : "—")}
        {row("مهلة السداد", dayCount(p.grace_days))}
        {s?.cancel_reason ? row("سبب الإلغاء", s.cancel_reason) : null}
        <div className="adm-btn-row" style={{ marginTop: 10 }}><FreeMonthButton org={p.organization_id} /></div>
        <p className="hint" style={{ marginBottom: 0 }}>إصدار فواتير الاشتراك يجي في المرحلة الجاية.</p>
      </section>
      <section className="card adm-card" aria-labelledby="bill-pay"><h2 id="bill-pay">سجل المدفوعات</h2>
        {p.payments.length ? <div className="table-wrap"><table className="links-table"><thead><tr><th scope="col">التاريخ</th><th scope="col">الوصف</th><th scope="col">المبلغ</th><th scope="col">الحالة</th><th scope="col">الإيصال</th></tr></thead>
          <tbody>{p.payments.map(payment => <tr key={payment.id}>
            <td>{formatDate(payment.created_at, { year: true })}</td>
            <td>{payment.plan ?? "—"} · {durationLabel(payment.months)}<span className="hint" style={{ display: "block" }} dir="ltr">{payment.reference}</span>{payment.reject_reason ? <span className="hint" style={{ display: "block" }}>{payment.reject_reason}</span> : null}</td>
            <td>{riyal(payment.amount)}</td>
            <td><span className={`chip-soft ${payment.status === "approved" ? "ok" : payment.status === "rejected" ? "rose" : ""}`}>{paymentStatusLabels[payment.status] ?? payment.status}</span></td>
            <td>{receipts[payment.id] ? <a href={receipts[payment.id]!} target="_blank" rel="noopener noreferrer">فتح<span className="sr-only"> إيصال {payment.reference}</span></a> : "—"}</td>
          </tr>)}</tbody></table></div> : <p className="empty">ما فيه مدفوعات بعد.</p>}
      </section>
    </div> },
    { id: "users", label: "المستخدمين", content: <section className="card adm-card" aria-labelledby="users-title"><h2 id="users-title">المستخدمين</h2>
      <p className="hint" style={{ marginTop: 0 }}>{arNumber(p.members.length)} عضو · دخل اليوم {arNumber(p.counts.signed_in_today)} · أولياء الأمور {arNumber(p.counts.guardians)}</p>
      <div className="table-wrap"><table className="links-table"><thead><tr><th scope="col">الاسم</th><th scope="col">الدور</th><th scope="col">الدخول</th><th scope="col">آخر دخول</th><th scope="col"><span className="sr-only">إجراءات</span></th></tr></thead>
        <tbody>{p.members.map(member => <tr key={member.user_id}>
          <td>{member.name || "—"}{member.locked ? <span className="chip-soft rose" style={{ marginInlineStart: 6 }}>مقفل مؤقتًا</span> : null}</td>
          <td>{roleLabels[member.role] ?? member.role}</td>
          <td dir="ltr" style={{ textAlign: "end" }}>{member.login.endsWith("@users.seer.local") ? member.login.split("@")[0] : member.login}</td>
          <td>{member.last_sign_in_at ? timeAgo(member.last_sign_in_at, now) : "ما دخل بعد"}</td>
          <td><MemberActions org={p.organization_id} member={member} /></td>
        </tr>)}</tbody></table></div>
    </section> },
    { id: "sections", label: "الأقسام المفعّلة", content: <section className="card adm-card" aria-labelledby="sections-title"><h2 id="sections-title">الأقسام المتاحة لهم</h2>
      <EntitlementsForm org={p.organization_id} planFeatures={p.plan?.features ?? []} blocked={p.entitlements.blocked} disabled={p.entitlements.disabled} trial={s?.status === "trial"} />
    </section> },
    { id: "setup", label: "التأسيس", content: <section className="card adm-card" aria-labelledby="setup-tab-title"><h2 id="setup-tab-title">التأسيس</h2>{setup}</section> },
    { id: "support", label: "الدعم", content: <section className="card adm-card" aria-labelledby="support-tab-title"><h2 id="support-tab-title">تذاكر الدعم</h2>{supportList}</section> },
    { id: "log", label: "السجل", content: <section className="card adm-card" aria-labelledby="log-title"><h2 id="log-title">السجل</h2>
      {p.log.length ? <ul className="adm-list">{p.log.map((entry, index) => <li key={index}><span>{auditLabel(entry.action)}</span><span className="hint">{timeAgo(entry.created_at, now)}</span></li>)}</ul> : <p className="empty">ما فيه عمليات مسجّلة على هالمنشأة.</p>}
    </section> },
  ];

  return <div className="adm-page">
    <nav aria-label="مسار الصفحة" className="adm-crumbs"><Link href="/admin/subscribers">المنشآت</Link> ‹ <span aria-current="page">{p.name}</span></nav>
    <header className="card adm-org-head">
      <div className="adm-avatar" aria-hidden="true">{p.name.replace(/^(روضة|حضانة|مدرسة|مدارس)\s+(ال)?/, "").slice(0, 1) || p.name.slice(0, 1)}</div>
      <div className="adm-org-title">
        <h1>{p.name}</h1>
        <p>{[orgTypeLabels[p.type] ?? p.type, p.city, `مشتركة من ${formatDate(p.created_at, { year: true })}`].filter(Boolean).join(" · ")}</p>
        <div className="adm-pills">
          <span className={`chip-soft ${pill.tone}`}>{pill.label}</span>
          {p.plan ? <span className="chip-soft plum">{p.plan.name}</span> : null}
          {s ? <span className="chip-soft sun">ينتهي {formatDate(`${s.ends_on}T12:00:00Z`, { year: true })}</span> : null}
          {s?.cancelled_at ? <span className="chip-soft rose">ملغي</span> : null}
        </div>
      </div>
      <OrgHeaderActions org={p.organization_id} plans={plans} currentPlan={s?.plan_id ?? null} suspended={s?.status === "suspended"} cancelled={Boolean(s?.cancelled_at)} />
    </header>
    <OrgTabs tabs={tabs} />
  </div>;
}
