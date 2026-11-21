import Link from "next/link";
import { PaymentDecision } from "./admin-forms";
import { activityPill, auditLabel, timeAgo } from "../lib/admin-format";
import { arNumber, formatDate, formatTime } from "../lib/dates";
import { durationLabel, riyal } from "../lib/subscriptions";

export type OverviewData = {
  decisions: { payments: number; oldest_payment: { organization: string; created_at: string } | null; join_requests: number; support_waiting: number; support_over_24h: number; ending_7_days: number };
  numbers: { active: number; trial: number; trial_ending_7_days: number; mrr: number; renewal_base: number; renewal_rate: number | null; signed_in_today: number; users: number };
  health: { database: boolean; cron: { job: string; status: string | null; at: string | null }[]; telegram_links: number; telegram_failed_today: number };
  activity: { kind: string; action: string; organization: string | null; organization_id?: string | null; detail?: string | null; thread?: string; at: string }[];
};
export type PendingTransfer = { id: string; organization_id: string; organization: string; plan: string; months: number; amount: number; reference: string; created_at: string };
export type HealthExtra = { locks24h: number | null; activeLocks: number | null; telegram: "ok" | "error" | "unlinked" | "off" };

const tones = { sun: "#F5A524", plum: "#7C5CFF", rose: "#EF5A6F", sky: "#3B82F6" } as const;

/** «نظرة عامة» (approved design): what needs a decision, the numbers, pending transfers, health, recent activity. */
export function OverviewView({ data, pending, extra, now = Date.now() }: { data: OverviewData; pending: PendingTransfer[]; extra: HealthExtra; now?: number }) {
  const d = data.decisions, n = data.numbers;
  const cronOk = data.health.cron.filter(job => job.status === "succeeded").length;
  const cronBad = data.health.cron.filter(job => job.status && job.status !== "succeeded");
  const decisions: { href: string; label: string; value: number; note: string; tone: keyof typeof tones }[] = [
    { href: "/admin/payments", label: "تحويلات بانتظار التأكيد", value: d.payments, tone: "sun",
      note: d.oldest_payment ? `أقدمها ${timeAgo(d.oldest_payment.created_at, now)} — ${d.oldest_payment.organization}` : "ما فيه تحويلات معلّقة" },
    { href: "/admin/join-requests", label: "طلبات انضمام جديدة", value: d.join_requests, tone: "plum", note: d.join_requests ? "قبول أو رفض بضغطة" : "ما فيه طلبات جديدة" },
    { href: "/admin/support", label: "تذاكر دعم بلا رد", value: d.support_waiting, tone: "rose",
      note: d.support_over_24h ? `${arNumber(d.support_over_24h)} منها أكثر من ٢٤ ساعة` : d.support_waiting ? "كلها خلال آخر ٢٤ ساعة" : "ما فيه تذاكر تنتظر" },
    { href: "/admin/subscribers?ending=1", label: "اشتراكات تنتهي خلال ٧ أيام", value: d.ending_7_days, tone: "sky", note: d.ending_7_days ? "يوصلهم تذكير تلقائي" : "ما فيه اشتراكات تنتهي قريبًا" },
  ];
  const healthRows: { label: string; value: string; state: "" | "warn" | "bad" | "soon" }[] = [
    { label: "الموقع وقاعدة البيانات", value: data.health.database ? "سليم" : "فيه مشكلة", state: data.health.database ? "" : "bad" },
    { label: "المهام التلقائية", value: data.health.cron.length ? (cronBad.length ? `${arNumber(cronBad.length)} فشلت آخر مرة: ${cronBad.map(job => job.job).join("، ")}` : `${arNumber(cronOk)} من ${arNumber(data.health.cron.length)} شغالة`) : "ما فيه بيانات", state: cronBad.length ? "bad" : data.health.cron.length ? "" : "soon" },
    { label: "حماية الدخول", value: extra.locks24h === null ? "ما فيه بيانات" : extra.locks24h ? `${arNumber(extra.locks24h)} قفل آخر ٢٤ ساعة${extra.activeLocks ? ` · ${arNumber(extra.activeLocks)} نشط الحين` : ""}` : "ما فيه أقفال اليوم", state: extra.activeLocks ? "warn" : extra.locks24h === null ? "soon" : "" },
    { label: "بوت التليقرام", value: extra.telegram === "ok" ? (data.health.telegram_failed_today ? `متصل · ${arNumber(data.health.telegram_failed_today)} رسالة فشلت اليوم` : "متصل") : extra.telegram === "error" ? "الربط فيه خطأ" : extra.telegram === "unlinked" ? "ما فيه محادثة مربوطة" : "غير مفعّل",
      state: extra.telegram === "ok" ? (data.health.telegram_failed_today ? "warn" : "") : extra.telegram === "error" ? "bad" : "warn" },
    { label: "آخر نسخة احتياطية", value: "قريبًا", state: "soon" },
  ];
  return <div className="adm-page">
    <header className="page-head"><div><h1>نظرة عامة</h1><p>{formatDate(new Date(now).toISOString(), { weekday: true })}</p></div></header>

    <section aria-labelledby="att" style={{ display: "grid", gap: 12 }}>
      <h2 id="att" style={{ margin: 0, fontSize: 17 }}>يحتاج قرارك الحين</h2>
      <div className="adm-decisions">{decisions.map(item => <Link key={item.href} className="card adm-decision" href={item.href} style={{ "--tone": tones[item.tone] } as React.CSSProperties}>
        <span className="label">{item.label}</span><span className="figure">{arNumber(item.value)}</span><span className="note">{item.note}</span>
      </Link>)}</div>
    </section>

    <section aria-label="أرقام المنصة" className="card adm-numbers">
      <div><p className="label">منشآت نشطة</p><p className="figure">{arNumber(n.active)}</p></div>
      <div><p className="label">في فترة التجربة</p><p className="figure">{arNumber(n.trial)}</p><p className="sub">{n.trial_ending_7_days ? `${arNumber(n.trial_ending_7_days)} منها تنتهي هالأسبوع` : "ولا وحدة تنتهي هالأسبوع"}</p></div>
      <div><p className="label">الدخل الشهري المتكرر</p><p className="figure">{riyal(Number(n.mrr))}</p><p className="sub">من الاشتراكات المؤكدة</p></div>
      <div><p className="label">نسبة التجديد</p><p className="figure">{n.renewal_rate === null ? "—" : `${arNumber(n.renewal_rate)}٪`}</p><p className="sub">{n.renewal_base ? `آخر ٩٠ يوم · من ${arNumber(n.renewal_base)}` : "ما انتهت فترات مدفوعة آخر ٩٠ يوم"}</p></div>
      <div><p className="label">مستخدمين دخلوا اليوم</p><p className="figure">{arNumber(n.signed_in_today)}</p><p className="sub">من {arNumber(n.users)} حساب</p></div>
    </section>

    <div className="adm-split">
      <section className="card adm-card wide" aria-labelledby="tr">
        <div className="adm-card-head"><h2 id="tr">تحويلات بانتظار التأكيد</h2><Link href="/admin/payments">كل التحويلات</Link></div>
        {pending.length ? <div className="table-wrap"><table className="links-table"><thead><tr><th scope="col">المنشأة</th><th scope="col">الباقة</th><th scope="col">المبلغ</th><th scope="col">المرجع</th><th scope="col">رُفع</th><th scope="col"><span className="sr-only">إجراء</span></th></tr></thead>
          <tbody>{pending.slice(0, 6).map(row => <tr key={row.id}>
            <td><Link href={`/admin/subscribers/${row.organization_id}`}>{row.organization}</Link></td>
            <td>{row.plan} · {durationLabel(row.months)}</td><td>{riyal(Number(row.amount))}</td>
            <td dir="ltr" style={{ textAlign: "end" }}>{row.reference}</td><td>{timeAgo(row.created_at, now)}</td>
            <td><PaymentDecision id={row.id} /></td>
          </tr>)}</tbody></table></div> : <p className="empty">ما فيه تحويلات بانتظار التأكيد.</p>}
      </section>
      <section className="card adm-card narrow" aria-labelledby="hl">
        <h2 id="hl">صحة المنصة</h2>
        <ul className="adm-list adm-health">{healthRows.map(item => <li key={item.label}><span className={`adm-dot-state${item.state ? ` ${item.state}` : ""}`} aria-hidden="true" /><span style={{ flex: 1 }}>{item.label}</span><span className="hint">{item.value}</span></li>)}</ul>
        <span className="adm-btn-row" style={{ marginTop: 10 }}><Link className="btn btn-sm" href="/admin#login-security">أمان الدخول</Link><Link className="btn btn-sm" href="/admin/settings#telegram">تيليقرام</Link></span>
      </section>
    </div>

    <section className="card adm-card" aria-labelledby="ac">
      <div className="adm-card-head"><h2 id="ac">آخر ما صار في المنصة</h2><Link href="/admin/settings#audit">السجل الكامل</Link></div>
      {data.activity.length ? <ul className="adm-list">{data.activity.map((event, index) => {
        const pill = activityPill(event.kind, event.action);
        const text = `${auditLabel(event.action)}${event.organization ? ` — ${event.organization}` : ""}${event.detail ? ` · ${event.detail}` : ""}`;
        const href = event.thread ? `/admin/support/${event.thread}` : event.organization_id ? `/admin/subscribers/${event.organization_id}` : event.kind === "join" ? "/admin/join-requests" : null;
        return <li key={index}><span className={`chip-soft ${pill.tone}`}>{pill.label}</span><span style={{ flex: 1 }}>{href ? <Link href={href}>{text}</Link> : text}</span><span className="hint" title={formatTime(event.at)}>{timeAgo(event.at, now)}</span></li>;
      })}</ul> : <p className="empty">ما صار شي بعد.</p>}
    </section>
  </div>;
}
