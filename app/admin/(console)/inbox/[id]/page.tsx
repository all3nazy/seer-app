import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdminRole, mayOpen } from "../../../../../lib/admin-role";
import { AdminNoAccess } from "../../../../../components/admin-no-access";
import { requestSession } from "../../../../../lib/supabase/server";
import { formatDate } from "../../../../../lib/dates";
import { gmailThreadLink, type InboxMessage } from "../../../../../lib/inbox";
import { InboxActions } from "../../../../../components/inbox-actions";

export const metadata = { title: "رسالة" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const size = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} م.ب` : `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;

/** One email in full (plain text only; opening it marks it read). Files stay in Gmail. */
export default async function AdminInboxMessage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await mayOpen("/admin/inbox"))) return <AdminNoAccess role={await currentAdminRole()} />;
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const { client } = await requestSession();
  const { data } = await client.rpc("admin_inbox_message", { message: id });
  const message = data as InboxMessage | null;
  if (!message) notFound();
  return <>
    <header className="page-head"><div>
      <p><Link href={message.archived_at ? "/admin/inbox?box=archived" : "/admin/inbox"}>← صندوق الوارد</Link></p>
      <h1>{message.subject || "(بدون عنوان)"}</h1>
      <p>من <strong>{message.from_name || message.from_email}</strong>{message.from_name ? <> · <span dir="ltr">{message.from_email}</span></> : null} · {formatDate(message.received_at)}</p>
    </div></header>
    <section className="card">
      <div className="inbox-body" dir="auto">{message.body || "(الرسالة بدون نص)"}</div>
      {message.attachments.length ? <div style={{ marginTop: 16 }}>
        <p className="hint">المرفقات (موجودة في جيميل):</p>
        <ul className="records">{message.attachments.map((file, index) => <li key={index}>📎 <span dir="auto">{file.name}</span> <span className="hint">· {size(file.size)}</span></li>)}</ul>
      </div> : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 20 }}>
        <a className="btn btn-primary" href={gmailThreadLink(message.thread_id)} target="_blank" rel="noopener noreferrer">رد من جيميل</a>
        <InboxActions id={message.id} archived={Boolean(message.archived_at)} />
      </div>
    </section>
  </>;
}
