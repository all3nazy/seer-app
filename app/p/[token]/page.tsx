import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { PrintButton } from "../../../components/print-button";
import { moodEmoji, moodLabels, meals, napLabel, portionShort, type Mood, type Portion } from "../../../lib/family";
import { attendanceLabels, type AttendanceStatus } from "../../../lib/students";
import { onColor } from "../../../lib/documents";
import { sar } from "../../../lib/finance";

export const dynamic = "force-dynamic";
export const metadata = { title: "بوابة ولي الأمر", robots: { index: false, follow: false } };

type Report = { date: string; mood: Mood | null; breakfast: Portion | null; lunch: Portion | null; snack: Portion | null; nap_minutes: number | null; diapers: number | null; activities: string | null; medication: string | null; incident: string | null; notes: string | null };
type Portal = {
  guardian: string;
  organization: { name: string; type: string; legal_name: string | null; phone: string | null; brand_color: string; logo_data: string | null };
  children: { name: string; section: string | null; today: AttendanceStatus | null; picked_up: { by: string; at: string } | null; attendance: Record<AttendanceStatus, number>; reports: Report[]; pickup_people: { name: string; relationship: string }[] }[];
  invoices: { number: number | null; title: string | null; status: string; due_date: string | null; total: number; paid: number; token: string }[];
  announcements: { title: string; body: string; pinned: boolean; at: string }[];
};
const day = (value: string) => new Date(value).toLocaleDateString("ar-SA", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const time = (value: string) => new Date(value).toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit" });

/** A guardian's private page: their children's day, attendance, invoices and announcements. Read-only. */
export default async function FamilyPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) notFound();
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("family_portal", { token });
  if (error || !data) notFound();
  const portal = data as Portal;
  const brand = /^#[0-9A-Fa-f]{6}$/.test(portal.organization.brand_color) ? portal.organization.brand_color : "#3E1657";
  const open = portal.invoices.filter(invoice => invoice.status === "issued");
  return <main className="portal" style={{ ["--brand" as string]: brand, ["--on-brand" as string]: onColor(brand) }}>
    <header className="portal-head">
      {portal.organization.logo_data ? <img src={portal.organization.logo_data} alt="" className="fdoc-logo" /> : <span className="fdoc-monogram" aria-hidden="true">{portal.organization.name.charAt(0)}</span>}
      <div><span>بوابة ولي الأمر</span><strong>{portal.organization.legal_name ?? portal.organization.name}</strong><span>أهلًا {portal.guardian}</span></div>
    </header>

    {portal.announcements.length ? <section className="portal-section"><h2>الإعلانات</h2>
      {portal.announcements.map((item, index) => <article key={index} className={`portal-card notice${item.pinned ? " pinned" : ""}`}><h3>{item.pinned ? "📌 " : ""}{item.title}</h3><p>{item.body}</p><small>{day(item.at)}</small></article>)}
    </section> : null}

    {portal.children.map(child => <section key={child.name} className="portal-section">
      <h2>{child.name}</h2>
      <div className="portal-card portal-today">
        <span>{child.section ?? ""}</span>
        <strong>{child.picked_up ? `انصرف مع ${child.picked_up.by} الساعة ${time(child.picked_up.at)}` : child.today ? `اليوم: ${attendanceLabels[child.today]}` : "ما تسجّل حضور اليوم بعد"}</strong>
        <span className="portal-stats">آخر ٣٠ يوم: {(["present", "late", "absent", "excused"] as AttendanceStatus[]).map(status => `${attendanceLabels[status]} ${Number(child.attendance[status] ?? 0).toLocaleString("ar-SA")}`).join(" · ")}</span>
      </div>
      {child.reports.length ? <div className="portal-reports">{child.reports.map(report => <details key={report.date} className="portal-card" open={report === child.reports[0]}>
        <summary><span>{report.mood ? moodEmoji[report.mood] : "📝"}</span> {day(report.date)}{report.mood ? ` — ${moodLabels[report.mood]}` : ""}</summary>
        <ul>
          {meals.filter(([key]) => report[key]).length ? <li>الأكل: {meals.filter(([key]) => report[key]).map(([key, label]) => `${label} ${portionShort[report[key] as Portion]}`).join("، ")}</li> : null}
          {napLabel(report.nap_minutes) ? <li>النوم: {napLabel(report.nap_minutes)}</li> : null}
          {report.diapers ? <li>تغيير الحفاض: {report.diapers.toLocaleString("ar-SA")}</li> : null}
          {report.activities ? <li>الأنشطة: {report.activities}</li> : null}
          {report.medication ? <li>الدواء: {report.medication}</li> : null}
          {report.incident ? <li className="portal-alert">ملاحظة مهمة: {report.incident}</li> : null}
          {report.notes ? <li>{report.notes}</li> : null}
        </ul>
      </details>)}</div> : null}
      {child.pickup_people.length ? <p className="hint">المصرّح لهم بالاستلام: {child.pickup_people.map(person => `${person.name} (${person.relationship})`).join("، ")}</p> : null}
    </section>)}

    {portal.invoices.length ? <section className="portal-section"><h2>الفواتير</h2>
      {open.length ? <p className="portal-due">المستحق عليكم: <strong>{sar(open.reduce((sum, invoice) => sum + Number(invoice.total) - Number(invoice.paid), 0))}</strong></p> : null}
      {portal.invoices.map(invoice => <Link key={invoice.token} className="portal-card portal-invoice" href={`/d/${invoice.token}`}>
        <span>{invoice.number ? `فاتورة ${invoice.number}` : "فاتورة"}{invoice.title ? ` — ${invoice.title}` : ""}</span>
        <span><strong>{sar(invoice.total)}</strong> <span className={`chip-soft ${invoice.status === "paid" ? "ok" : "coral"}`}>{invoice.status === "paid" ? "مسددة" : `متبقي ${sar(Number(invoice.total) - Number(invoice.paid))}`}</span></span>
      </Link>)}
    </section> : null}

    <footer className="portal-foot no-print">
      {portal.organization.phone ? <a className="btn" href={`tel:${portal.organization.phone}`}>اتصال بالإدارة</a> : null}
      <PrintButton />
      <p>هذا رابط خاص بكم. لا تشاركونه مع غيركم.</p>
    </footer>
  </main>;
}
