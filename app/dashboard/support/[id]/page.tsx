import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requestSession } from "../../../../lib/supabase/server";
import { SupportThread, type SupportMessage } from "../../../../components/support-thread";

export const dynamic = "force-dynamic";
export const metadata = { title: "تذكرة دعم" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One of the person's tickets (RLS returns nothing for anyone else's). */
export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const { client, user } = await requestSession();
  if (!user) redirect("/login");
  const [threadResult, messagesResult] = await Promise.all([
    client.from("support_threads").select("id,subject,status,created_at").eq("id", id).eq("user_id", user.id).maybeSingle(),
    client.from("support_messages").select("id,body,from_admin,created_at").eq("thread_id", id).order("created_at").limit(500),
  ]);
  const thread = threadResult.data as { id: string; subject: string; status: "open" | "closed"; created_at: string } | null;
  if (!thread) notFound();
  return <div style={{ maxWidth: 760 }}>
    <header className="page-head"><div><h1>{thread.subject}</h1><p><Link href="/dashboard/support">كل تذاكري</Link></p></div></header>
    <section className="card"><SupportThread threadId={thread.id} initialMessages={(messagesResult.data ?? []) as SupportMessage[]} initialStatus={thread.status} side="user" /></section>
  </div>;
}
