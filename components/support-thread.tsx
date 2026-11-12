"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { newTicketPath } from "../lib/support";
import { confirmAction } from "./confirm";
import { notify } from "./feedback";
import { viewingSupportThread } from "./support-badge";

export type SupportMessage = { id: string; body: string; from_admin: boolean; created_at: string };
const time = (iso: string) => new Date(iso).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const errorText = (code?: string) => code === "54000" ? "رسائل كثيرة خلال وقت قصير. انتظر قليلًا ثم أرسل." : code === "22023" ? "التذكرة مغلقة. افتح تذكرة جديدة إذا عندك سؤال ثاني." : code === "42501" ? "ما عندك صلاحية على هذه التذكرة." : "تعذر الإرسال. حاول مرة ثانية.";

/**
 * One support conversation, live: new messages arrive through Supabase Realtime (one channel, closed
 * when the page closes). Sending appends the message at once; its realtime echo is ignored by id.
 */
export function SupportThread({ threadId, initialMessages, initialStatus, side }: { threadId: string; initialMessages: SupportMessage[]; initialStatus: "open" | "closed"; side: "user" | "admin" }) {
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState(initialStatus);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const log = useRef<HTMLOListElement>(null);
  // Opening the thread marks it read for this side (owner or team), and so does a reply that arrives
  // while it is on screen; the badge drops it at once.
  useEffect(() => {
    viewingSupportThread(threadId);
    void getSupabaseBrowserClient().rpc("mark_support_read", { thread: threadId });
    return () => viewingSupportThread(null);
  }, [threadId]);
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    const channel = client.channel(`support-${threadId}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `thread_id=eq.${threadId}` }, (payload: { new: unknown }) => {
        const message = payload.new as SupportMessage;
        setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message]);
        // A message from the other side, read here: keep the thread read.
        if (message.from_admin !== (side === "admin") && document.visibilityState === "visible") void client.rpc("mark_support_read", { thread: threadId });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_threads", filter: `id=eq.${threadId}` }, (payload: { new: unknown }) => {
        const row = payload.new as { status?: "open" | "closed" };
        if (row.status) setStatus(row.status);
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [threadId, side]);
  useEffect(() => { log.current?.lastElementChild?.scrollIntoView({ block: "nearest" }); }, [messages.length]);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    const { data, error } = await getSupabaseBrowserClient().rpc("reply_support", { thread: threadId, body });
    setSending(false);
    if (error) { notify(errorText(error.code), "error"); return; }
    setDraft("");
    setMessages(current => current.some(item => item.id === data) ? current : [...current, { id: String(data), body, from_admin: side === "admin", created_at: new Date().toISOString() }]);
  }
  async function close() {
    if (!(await confirmAction(side === "admin" ? "إغلاق التذكرة؟ يوصل المستخدم إشعار بالإغلاق." : "إغلاق التذكرة؟ تقدر تفتح تذكرة جديدة متى ما احتجت."))) return;
    const { error } = await getSupabaseBrowserClient().rpc("close_support_thread", { thread: threadId });
    if (error) { notify(errorText(error.code), "error"); return; }
    setStatus("closed");
    notify("أُغلقت التذكرة.", "info", "done");
  }
  return <div className="support-thread">
    <ol className="support-messages" ref={log} aria-label="الرسائل" aria-live="polite">
      {messages.map(message => <li key={message.id} className={message.from_admin ? "from-team" : "from-user"}>
        <span className="support-who">{message.from_admin ? "فريق سِير" : side === "admin" ? "المستخدم" : "أنت"}</span>
        <p>{message.body}</p>
        <time dateTime={message.created_at}>{time(message.created_at)}</time>
      </li>)}
    </ol>
    {status === "open" ? <form className="support-reply" onSubmit={send}>
      <label className="sr-only" htmlFor={`reply-${threadId}`}>ردّك</label>
      <textarea id={`reply-${threadId}`} value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} required placeholder={side === "admin" ? "اكتب ردّك للمستخدم" : "اكتب ردّك لفريق سِير"} disabled={sending} />
      <div className="support-reply-actions">
        <button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()}>{sending ? "جارٍ الإرسال…" : "إرسال"}</button>
        <button type="button" className="btn" onClick={() => void close()}>إغلاق التذكرة</button>
      </div>
    </form> : <p className="info-banner" role="status">التذكرة مغلقة.{side === "user" ? <> <Link href={newTicketPath}>افتح تذكرة جديدة</Link></> : null}</p>}
  </div>;
}
