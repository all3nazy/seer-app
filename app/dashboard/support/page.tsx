import Link from "next/link";
import { requestMemberships, requestSession } from "../../../lib/supabase/server";
import { redirect } from "next/navigation";
import { newTicketPath } from "../../../lib/support";
import { BackLink } from "../../../components/back-link";

export const dynamic = "force-dynamic";
export const metadata = { title: "الدعم" };

type Thread = { id: string; subject: string; status: string; last_sender: string; last_message_at: string };
const date = (iso: string) => new Date(iso).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", day: "numeric", month: "short" });

/** The person's tickets with the Seer team, open ones first. */
export default async function SupportPage() {
  const { client, user } = await requestSession();
  if (!user) redirect("/login");
  const [{ data }, memberships] = await Promise.all([
    client.from("support_threads").select("id,subject,status,last_sender,last_message_at").eq("user_id", user.id).order("status", { ascending: false }).order("last_message_at", { ascending: false }).limit(50),
    requestMemberships(),
  ]);
  const threads = (data ?? []) as Thread[];
  return <div style={{ maxWidth: 760 }}>
    <BackLink href="/dashboard" history />
    <header className="page-head"><div><h1>الدعم</h1><p>تذاكرك مع فريق سِير. يوصلك إشعار مع كل رد.</p></div>
      {memberships.data.length ? <Link className="btn btn-primary" href={newTicketPath}>تذكرة جديدة</Link> : null}</header>
    <section className="card">
      {threads.length ? <ul className="records">{threads.map(thread => <li key={thread.id}>
        <Link href={`/dashboard/support/${thread.id}`} className="support-row">
          <span><strong>{thread.subject}</strong><span className="hint" style={{ display: "block" }}>آخر رسالة {date(thread.last_message_at)}</span></span>
          <span className={`chip-soft ${thread.status === "closed" ? "" : thread.last_sender === "admin" ? "ok" : "coral"}`}>{thread.status === "closed" ? "مغلقة" : thread.last_sender === "admin" ? "وصلك رد" : "بانتظار الفريق"}</span>
        </Link>
      </li>)}</ul> : <p className="empty">ما عندك تذاكر. اسأل المساعد أولًا، وإذا ما لقيت جوابك اضغط «تكلّم مع فريق سِير».</p>}
    </section>
  </div>;
}
