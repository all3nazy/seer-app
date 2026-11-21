import Link from "next/link";
import { BackupDownload, BackupNowButton, ErrorActions } from "./admin-stage4-forms";
import { timeAgo } from "../lib/admin-format";
import { backupFresh, cronNames, formatBytes, formatDuration, notMirrored, queueLabels, queueState, viewSections, waitText } from "../lib/admin-stage4";
import { arNumber, formatDate, formatDateTime } from "../lib/dates";
import { featureLabels, riyal } from "../lib/subscriptions";
import { orgTypeLabels } from "../lib/org-invites";

// Backups -------------------------------------------------------------------------------------------
export type BackupRow = { id: number; kind: "daily" | "manual"; status: "running" | "ok" | "failed"; folder: string; started_at: string; finished_at: string | null; duration_ms: number | null;
  bytes: number | null; tables: number | null; rows: number | null; manifest: { files?: { name: string; rows: number; bytes: number }[] } | null; error: string | null; triggered_by: string | null; purged_at: string | null };
const runStatus = { ok: { label: "ناجحة", tone: "ok" }, failed: { label: "فشلت", tone: "rose" }, running: { label: "شغالة", tone: "sun" } } as const;

export function BackupsView({ runs, now = Date.now() }: { runs: BackupRow[]; now?: number }) {
  const lastOk = runs.find(run => run.status === "ok");
  const fresh = backupFresh(lastOk?.finished_at, now);
  return <div className="adm-page">
    <header className="page-head"><div><h1>النسخ الاحتياطي</h1><p>نسخة منطقية يومية لكل الجداول وحسابات الدخول (بدون كلمات المرور)، تنحفظ ٣٠ يوم في مخزن خاص. طريقة الاسترجاع في docs/restore.md.</p></div>
      <BackupNowButton /></header>
    <section className={`card adm-card adm-backup-state${fresh ? "" : " is-late"}`} aria-labelledby="bk-state" role={fresh ? undefined : "alert"}>
      <h2 id="bk-state">آخر نسخة ناجحة</h2>
      <p style={{ margin: 0 }}>{lastOk ? <>{formatDateTime(lastOk.finished_at ?? lastOk.started_at)} ({timeAgo(lastOk.finished_at ?? lastOk.started_at, now)}) · {formatBytes(lastOk.bytes)} · {arNumber(Number(lastOk.rows ?? 0))} صف في {arNumber(Number(lastOk.tables ?? 0))} ملف</> : "ما فيه نسخة ناجحة بعد."}</p>
      {!fresh ? <p className="adm-warn" style={{ margin: 0 }}>آخر نسخة ناجحة أقدم من ٢٦ ساعة — يوصلك تنبيه تيليقرام. تأكد من CRON_SECRET ومفتاح الخدمة في مشروع المنصة.</p> : null}
      <p className="hint" style={{ margin: 0 }}>Supabase المجاني ما فيه نسخ يومية ولا استرجاع لنقطة زمنية (PITR)؛ هذي النسخ تغطي الفترة لين الترقية إلى Pro.</p>
    </section>
    <section className="card adm-card" aria-labelledby="bk-list"><h2 id="bk-list">النسخ ({arNumber(runs.length)})</h2>
      {runs.length ? <div className="table-wrap"><table className="links-table"><thead><tr><th scope="col">التاريخ</th><th scope="col">النوع</th><th scope="col">الحالة</th><th scope="col">الحجم</th><th scope="col">الصفوف</th><th scope="col">المدة</th><th scope="col"><span className="sr-only">تحميل</span></th></tr></thead>
        <tbody>{runs.map(run => <tr key={run.id}>
          <td>{formatDateTime(run.started_at)}<span className="hint" style={{ display: "block" }} dir="ltr">{run.folder}</span></td>
          <td>{run.kind === "daily" ? "يومية" : "يدوية"}{run.triggered_by ? <span className="hint" style={{ display: "block" }} dir="ltr">{run.triggered_by}</span> : null}</td>
          <td><span className={`chip-soft ${runStatus[run.status].tone}`}>{runStatus[run.status].label}</span>{run.purged_at ? <span className="hint" style={{ display: "block" }}>انحذفت (أقدم من ٣٠ يوم)</span> : null}
            {run.error ? <span className="hint" style={{ display: "block" }}>{run.error}</span> : null}</td>
          <td>{run.bytes !== null ? formatBytes(run.bytes) : "—"}</td>
          <td>{run.rows !== null ? arNumber(Number(run.rows)) : "—"}{run.tables ? <span className="hint" style={{ display: "block" }}>{arNumber(run.tables)} ملف</span> : null}</td>
          <td>{run.duration_ms !== null ? formatDuration(run.duration_ms) : "—"}</td>
          <td>{run.status === "ok" && !run.purged_at ? <BackupDownload run={run.id} files={(run.manifest?.files ?? []).map(file => file.name)} /> : null}</td>
        </tr>)}</tbody></table></div> : <p className="empty">ما فيه نسخ بعد. أول نسخة يومية بعد منتصف الليل، أو اضغط «نسخة الحين».</p>}
    </section>
    <section className="card adm-card" aria-labelledby="bk-org"><h2 id="bk-org">تصدير بيانات منشأة</h2>
      <p style={{ margin: 0 }}>لمشترك يبي يغادر (حق نقل البيانات في نظام حماية البيانات الشخصية): افتح ملف المنشأة واضغط «تصدير بياناتها». يطلع ملف JSON فيه كل جداولها، والتصدير ينسجل في سجلها.</p>
    </section>
  </div>;
}

// Health --------------------------------------------------------------------------------------------
export type HealthData = {
  database: boolean; checked_at: string;
  cron: { name: string; schedule: string; active: boolean; status: string | null; message: string | null; started_at: string | null; duration_ms: number | null; failed_24h: number }[];
  queues: { key: string; waiting: number; failed: number; oldest: string | null }[];
  backup: { status: string; kind: string; started_at: string; finished_at: string | null; bytes: number | null; error: string | null } | null;
  last_ok_backup: string | null;
  errors: { fingerprint: string; kind: string; message: string; route: string | null; count: number; last_seen: string; status: string; organization: string | null }[];
};
export function HealthView({ data, site, links, now = Date.now() }: { data: HealthData | null; site: { app: string; admin: string }; links: { supabase: string | null; vercel: string }; now?: number }) {
  const dot = (state: "" | "warn" | "bad" | "soon") => <span className={`adm-dot-state${state ? ` ${state}` : ""}`} aria-hidden="true" />;
  return <div className="adm-page">
    <header className="page-head"><div><h1>صحة النظام</h1><p>{data ? `آخر فحص ${formatDateTime(data.checked_at)}` : "ما قدرت أقرأ حالة النظام."}</p></div>
      <span className="adm-btn-row">{links.supabase ? <a className="btn" href={links.supabase} target="_blank" rel="noopener noreferrer">لوحة Supabase</a> : null}<a className="btn" href={links.vercel} target="_blank" rel="noopener noreferrer">لوحة Vercel</a></span></header>
    <section className="card adm-card" aria-labelledby="hl-site"><h2 id="hl-site">الموقع وقاعدة البيانات</h2>
      <ul className="adm-list adm-health">
        <li>{dot(data?.database ? "" : "bad")}<span style={{ flex: 1 }}>قاعدة البيانات</span><span className="hint">{data?.database ? "تستجيب" : "ما تستجيب"}</span></li>
        <li>{dot("")}<span style={{ flex: 1 }}>المنصة</span><a className="hint" href={site.app} dir="ltr" target="_blank" rel="noopener noreferrer">{site.app.replace(/^https?:\/\//, "")}</a></li>
        <li>{dot("")}<span style={{ flex: 1 }}>سِير أدمن</span><span className="hint" dir="ltr">{site.admin.replace(/^https?:\/\//, "")}</span></li>
        <li>{dot(backupFresh(data?.last_ok_backup, now) ? "" : "bad")}<span style={{ flex: 1 }}><Link href="/admin/backups">آخر نسخة احتياطية</Link></span>
          <span className="hint">{data?.last_ok_backup ? timeAgo(data.last_ok_backup, now) : "ما فيه نسخة ناجحة"}{data?.backup?.status === "failed" ? " · آخر محاولة فشلت" : ""}</span></li>
      </ul>
    </section>
    <section className="card adm-card" aria-labelledby="hl-cron"><h2 id="hl-cron">المهام التلقائية (pg_cron)</h2>
      {data?.cron.length ? <div className="table-wrap"><table className="links-table"><thead><tr><th scope="col">المهمة</th><th scope="col">الجدول</th><th scope="col">آخر تشغيل</th><th scope="col">النتيجة</th><th scope="col">المدة</th></tr></thead>
        <tbody>{data.cron.map(job => <tr key={job.name}>
          <td>{cronNames[job.name] ?? job.name}<span className="hint" style={{ display: "block" }} dir="ltr">{job.name}</span></td>
          <td dir="ltr" style={{ textAlign: "end" }}>{job.schedule}{job.active ? "" : " (موقوفة)"}</td>
          <td>{job.started_at ? timeAgo(job.started_at, now) : "ما اشتغلت بعد"}</td>
          <td><span className={`chip-soft ${job.status === "succeeded" ? "ok" : job.status ? "rose" : ""}`}>{job.status === "succeeded" ? "نجحت" : job.status === "failed" ? "فشلت" : job.status ?? "—"}</span>
            {job.failed_24h ? <span className="hint" style={{ display: "block" }}>{arNumber(job.failed_24h)} فشل آخر ٢٤ ساعة</span> : null}{job.status && job.status !== "succeeded" && job.message ? <span className="hint" style={{ display: "block" }}>{job.message}</span> : null}</td>
          <td>{job.duration_ms !== null ? formatDuration(job.duration_ms) : "—"}</td>
        </tr>)}</tbody></table></div> : <p className="empty">ما فيه بيانات مهام (pg_cron غير مفعّل أو ما اشتغلت بعد).</p>}
    </section>
    <section className="card adm-card" aria-labelledby="hl-queues"><h2 id="hl-queues">الطوابير</h2>
      <ul className="adm-list adm-health">{(data?.queues ?? []).map(queue => <li key={queue.key}>{dot(queueState(queue, now))}<span style={{ flex: 1 }}>{queueLabels[queue.key] ?? queue.key}</span>
        <span className="hint">{queue.waiting ? `${arNumber(queue.waiting)} بالانتظار · أقدمها ${waitText(queue.oldest, now)}` : "ما فيه شي بالانتظار"}{queue.failed ? ` · ${arNumber(queue.failed)} فشل` : ""}</span></li>)}</ul>
    </section>
    <section className="card adm-card" aria-labelledby="hl-errors"><h2 id="hl-errors">آخر الأخطاء</h2>
      {data?.errors.length ? <ul className="adm-list">{data.errors.map(error => <li key={error.fingerprint} style={{ alignItems: "flex-start" }}>
        <span style={{ flex: 1, minWidth: 0 }}><strong>{error.message}</strong><span className="hint" style={{ display: "block" }}>{[error.kind, error.route, error.organization, `${arNumber(error.count)} مرة`, `آخرها ${timeAgo(error.last_seen, now)}`].filter(Boolean).join(" · ")}</span></span>
        <ErrorActions fingerprint={error.fingerprint} />
      </li>)}</ul> : <p className="empty">ما فيه أخطاء جديدة. 👍</p>}
    </section>
  </div>;
}

// Read-only view of an organization --------------------------------------------------------------------
export type OrgViewData = {
  organization_id: string; name: string; type: string; section: string; today: string; access: string; plan: string | null;
  counts: { children: number; staff: number; guardians: number; sections: number };
  attendance_today: { present: number; absent: number; late: number; excused: number };
  students?: { name: string; gender: string | null; section: string | null; created_at: string }[];
  days?: { day: string; present: number; absent: number; late: number; excused: number }[];
  finance?: { invoiced: number; invoices: number; collected: number; collected_month: number; drafts: number; recent: { paid_on: string; amount: number; method: string }[] };
  staff?: { name: string; role: string; job_title: string | null }[];
  settings?: { disabled: string[]; blocked: string[]; colors: { primary: string | null; accent: string | null } | null; message_channel: string | null; message_provider: string | null; city: string | null };
};
const roleNames: Record<string, string> = { owner: "المالك", admin: "مدير", staff: "موظف" };
const methods: Record<string, string> = { cash: "نقدًا", bank_transfer: "تحويل", mada: "مدى", card: "بطاقة", apple_pay: "Apple Pay", google_pay: "Google Pay", tabby: "تابي", tamara: "تمارا", cheque: "شيك", other: "أخرى" };

export function OrgViewMirror({ data }: { data: OrgViewData }) {
  const base = `/admin/subscribers/${data.organization_id}/view`;
  const a = data.attendance_today;
  return <div className="adm-page adm-mirror">
    <p className="adm-mirror-banner" role="status"><strong>وضع المشاهدة — للقراءة فقط.</strong> تشوف «{data.name}» مثل ما يشوفها المالك، بدون الدخول بحسابه وبدون أي تعديل. كل مشاهدة تنسجل في سجل المنشأة.</p>
    <header className="page-head"><div><h1>{data.name}</h1><p>{orgTypeLabels[data.type] ?? data.type}{data.plan ? ` · ${data.plan}` : ""} · {formatDate(`${data.today}T12:00:00Z`, { weekday: true })}</p></div>
      <Link className="btn" href={`/admin/subscribers/${data.organization_id}`}>رجوع إلى ملف المنشأة</Link></header>
    <nav className="segments" aria-label="صفحات المنشأة">{viewSections.map(([key, label]) => <Link key={key} href={key === "dashboard" ? base : `${base}?section=${key}`} aria-current={data.section === key ? "page" : undefined}>{label}</Link>)}</nav>
    {data.section === "dashboard" ? <>
      <section className="card adm-numbers" aria-label="أرقام المنشأة">
        <div><p className="label">الطلاب</p><p className="figure">{arNumber(data.counts.children)}</p></div>
        <div><p className="label">الفريق</p><p className="figure">{arNumber(data.counts.staff)}</p></div>
        <div><p className="label">أولياء الأمور</p><p className="figure">{arNumber(data.counts.guardians)}</p></div>
        <div><p className="label">الفصول</p><p className="figure">{arNumber(data.counts.sections)}</p></div>
      </section>
      <section className="card adm-card" aria-labelledby="mv-att"><h2 id="mv-att">حضور اليوم</h2>
        <p style={{ margin: 0 }}>حاضر {arNumber(a.present)} · غائب {arNumber(a.absent)} · متأخر {arNumber(a.late)} · بعذر {arNumber(a.excused)}</p></section>
      <section className="card adm-card" aria-labelledby="mv-rest"><h2 id="mv-rest">صفحات ما تنعرض هنا بعد</h2><p className="hint" style={{ margin: 0 }}>{notMirrored.join("، ")}.</p></section>
    </> : null}
    {data.section === "students" ? <section className="card adm-card" aria-labelledby="mv-st"><h2 id="mv-st">الطلاب والأطفال ({arNumber(data.counts.children)})</h2>
      {data.students?.length ? <div className="table-wrap"><table className="links-table"><thead><tr><th scope="col">الاسم</th><th scope="col">الفصل</th><th scope="col">الجنس</th><th scope="col">أُضيف</th></tr></thead>
        <tbody>{data.students.map((s, index) => <tr key={index}><td>{s.name}</td><td>{s.section ?? "—"}</td><td>{s.gender === "male" ? "ذكر" : s.gender === "female" ? "أنثى" : "—"}</td><td>{formatDate(s.created_at, { year: true })}</td></tr>)}</tbody></table></div>
        : <p className="empty">ما فيه طلاب بعد.</p>}
      {data.counts.children > 300 ? <p className="hint">يعرض أول ٣٠٠ بالترتيب الأبجدي.</p> : null}
    </section> : null}
    {data.section === "attendance" ? <section className="card adm-card" aria-labelledby="mv-at"><h2 id="mv-at">الحضور آخر ١٤ يوم</h2>
      {data.days?.length ? <div className="table-wrap"><table className="links-table"><thead><tr><th scope="col">اليوم</th><th scope="col">حاضر</th><th scope="col">غائب</th><th scope="col">متأخر</th><th scope="col">بعذر</th></tr></thead>
        <tbody>{data.days.map(d => <tr key={d.day}><td>{formatDate(`${d.day}T12:00:00Z`, { weekday: true })}</td><td>{arNumber(d.present)}</td><td>{arNumber(d.absent)}</td><td>{arNumber(d.late)}</td><td>{arNumber(d.excused)}</td></tr>)}</tbody></table></div>
        : <p className="empty">ما سجّلوا حضور آخر ١٤ يوم.</p>}
    </section> : null}
    {data.section === "finance" && data.finance ? <>
      <section className="card adm-numbers" aria-label="ملخص المالية">
        <div><p className="label">الفواتير الصادرة</p><p className="figure">{riyal(Number(data.finance.invoiced))}</p><p className="sub">{arNumber(data.finance.invoices)} فاتورة{data.finance.drafts ? ` · ${arNumber(data.finance.drafts)} مسودة` : ""}</p></div>
        <div><p className="label">المحصّل</p><p className="figure">{riyal(Number(data.finance.collected))}</p></div>
        <div><p className="label">المتبقي</p><p className="figure">{riyal(Math.max(0, Number(data.finance.invoiced) - Number(data.finance.collected)))}</p></div>
        <div><p className="label">محصّل هالشهر</p><p className="figure">{riyal(Number(data.finance.collected_month))}</p></div>
      </section>
      <section className="card adm-card" aria-labelledby="mv-pay"><h2 id="mv-pay">آخر المدفوعات</h2>
        {data.finance.recent.length ? <ul className="adm-list">{data.finance.recent.map((p, index) => <li key={index}><span style={{ flex: 1 }}>{riyal(Number(p.amount))} · {methods[p.method] ?? p.method}</span><span className="hint">{formatDate(`${p.paid_on}T12:00:00Z`, { year: true })}</span></li>)}</ul>
          : <p className="empty">ما فيه مدفوعات.</p>}</section>
    </> : null}
    {data.section === "staff" ? <section className="card adm-card" aria-labelledby="mv-sf"><h2 id="mv-sf">الفريق ({arNumber(data.staff?.length ?? 0)})</h2>
      {data.staff?.length ? <div className="table-wrap"><table className="links-table"><thead><tr><th scope="col">الاسم</th><th scope="col">الدور</th><th scope="col">المسمى</th></tr></thead>
        <tbody>{data.staff.map((m, index) => <tr key={index}><td>{m.name}</td><td>{roleNames[m.role] ?? m.role}</td><td>{m.job_title ?? "—"}</td></tr>)}</tbody></table></div> : <p className="empty">ما فيه أعضاء.</p>}
    </section> : null}
    {data.section === "settings" && data.settings ? <section className="card adm-card" aria-labelledby="mv-set"><h2 id="mv-set">الإعدادات</h2>
      <div className="adm-row"><span>المدينة</span><span>{data.settings.city ?? "—"}</span></div>
      <div className="adm-row"><span>الأقسام المطفية عندهم</span><span>{data.settings.disabled.length ? data.settings.disabled.map(key => featureLabels[key as keyof typeof featureLabels] ?? key).join("، ") : "لا شيء"}</span></div>
      <div className="adm-row"><span>الأقسام الممنوعة من المنصة</span><span>{data.settings.blocked.length ? data.settings.blocked.map(key => featureLabels[key as keyof typeof featureLabels] ?? key).join("، ") : "لا شيء"}</span></div>
      <div className="adm-row"><span>قناة الرسائل</span><span>{data.settings.message_channel === "sms" ? "SMS" : data.settings.message_channel === "whatsapp" ? "واتساب" : "—"}{data.settings.message_provider ? ` · ${data.settings.message_provider}` : ""}</span></div>
      <div className="adm-row"><span>الألوان</span><span>{data.settings.colors?.primary ? <><span className="adm-swatch" style={{ background: data.settings.colors.primary }} aria-hidden="true" /> <span dir="ltr">{data.settings.colors.primary}</span></> : "الافتراضية"}</span></div>
    </section> : null}
  </div>;
}
