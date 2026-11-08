import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { ConfirmPickupForm } from "../../../components/message-forms";
import { onColor } from "../../../lib/documents";

export const dynamic = "force-dynamic";
export const metadata = { title: "تأكيد الاستلام", robots: { index: false, follow: false } };

/** The person who collected a child confirms it with their ID number, from the WhatsApp link. */
export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) notFound();
  const client = await createSupabaseServerClient();
  const { data } = await client.rpc("pickup_confirmation_view", { token });
  if (!data) notFound();
  const view = data as { child: string; picked_by: string; picked_at: string; confirmed_at: string | null; locked: boolean; organization: string; brand_color: string };
  const brand = /^#[0-9A-Fa-f]{6}$/.test(view.brand_color) ? view.brand_color : "#3E1657";
  const time = new Date(view.picked_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", weekday: "long", hour: "numeric", minute: "2-digit" });
  return <main className="portal" style={{ ["--brand" as string]: brand, ["--on-brand" as string]: onColor(brand) }}>
    <header className="portal-head"><span className="fdoc-monogram" aria-hidden="true">{view.organization.charAt(0)}</span><div><span>تأكيد الاستلام</span><strong>{view.organization}</strong></div></header>
    <section className="portal-section">
      <div className="portal-card pay-summary"><span>استلمتم</span><strong>{view.child}</strong><span>{view.picked_by} · {time}</span></div>
      {view.confirmed_at ? <div className="portal-card pay-result ok"><strong>✓ الاستلام مؤكد</strong></div>
        : view.locked ? <div className="portal-card pay-result bad"><strong>انقفل الرابط بعد محاولات خاطئة. تواصل مع المدرسة.</strong></div>
        : <><p className="hint" style={{ textAlign: "center" }}>للتأكيد اكتب رقم هويتك أو إقامتك المسجّل لدى المدرسة.</p><ConfirmPickupForm token={token} /></>}
    </section>
  </main>;
}
