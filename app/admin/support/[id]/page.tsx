import Link from "next/link";
import { notFound } from "next/navigation";
import { requestSession } from "../../../../lib/supabase/server";
import { SupportThread, type SupportMessage } from "../../../../components/support-thread";
import { BackLink } from "../../../../components/back-link";

export const dynamic = "force-dynamic";
export const metadata = { title: "تذكرة دعم" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Thread = { id: string; subject: string; status: "open" | "closed"; organization_id: string; page: string | null; assistant_questions: string[]; created_at: string };

/** One ticket for the team: who, which organization, the page and the assistant questions, then the live conversation. */
export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const { client } = await requestSession();
  const [threadResult, messagesResult, listResult] = await Promise.all([
    client.from("support_threads").select("id,subject,status,organization_id,page,assistant_questions,created_at").eq("id", id).maybeSingle(),
    client.from("support_messages").select("id,body,from_admin,created_at").eq("thread_id", id).order("created_at").limit(500),
    client.rpc("admin_support_threads", { one_thread: id }),
  ]);
  const thread = threadResult.data as Thread | null;
  if (!thread) notFound();
  const who = ((listResult.data ?? []) as { id: string; organization: string; user_name: string | null; user_email: string | null }[])[0];
  return <div style={{ maxWidth: 860 }}>
    <BackLink href="/admin/support" label="رجوع إلى التذاكر" />
    <header className="page-head"><div><h1>{thread.subject}</h1></div></header>
    <section className="support-context" aria-label="تفاصيل التذكرة">
      <span><strong>المنشأة:</strong> <Link href={`/admin/subscribers/${thread.organization_id}`}>{who?.organization ?? "—"}</Link></span>
      <span><strong>المستخدم:</strong> {who?.user_name || "—"} {who?.user_email ? <span dir="ltr">({who.user_email})</span> : null}</span>
      <span><strong>الصفحة:</strong> {thread.page ? <span dir="ltr">{thread.page}</span> : "—"}</span>
      {thread.assistant_questions.length ? <span><strong>آخر أسئلته للمساعد:</strong> {thread.assistant_questions.map(q => `«${q}»`).join("، ")}</span> : null}
      <span><strong>فُتحت:</strong> {new Date(thread.created_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</span>
    </section>
    <section className="card" style={{ marginTop: 16 }}><SupportThread threadId={thread.id} initialMessages={(messagesResult.data ?? []) as SupportMessage[]} initialStatus={thread.status} side="admin" /></section>
  </div>;
}
