import Link from "next/link";
import { currentAdminRole, mayOpen } from "../../../../lib/admin-role";
import { AdminNoAccess } from "../../../../components/admin-no-access";
import { requestSession } from "../../../../lib/supabase/server";
import { arNumber, formatDate } from "../../../../lib/dates";
import { supportEmail } from "../../../../lib/support";
import type { InboxRow } from "../../../../lib/inbox";

export const metadata = { title: "صندوق الوارد" };

/** الدعم والتواصل › صندوق الوارد: a copy of what reaches the Seer Gmail inbox (read and archive here, reply in Gmail). */
export default async function AdminInbox({ searchParams }: { searchParams: Promise<{ box?: string }> }) {
  if (!(await mayOpen("/admin/inbox"))) return <AdminNoAccess role={await currentAdminRole()} />;
  const archived = (await searchParams).box === "archived";
  const { client } = await requestSession();
  const { data, error } = await client.rpc("admin_inbox", { box: archived ? "archived" : "inbox" });
  const rows = (data ?? []) as InboxRow[];
  const unread = rows.filter(row => !row.read_at).length;
  return <>
    <header className="page-head"><div><h1>صندوق الوارد</h1><p>كل إيميل يوصل <span dir="ltr">{supportEmail}</span> يظهر هنا خلال دقائق. الرد يكون من جيميل.</p></div></header>
    <nav className="inbox-tabs" aria-label="صناديق البريد">
      <Link href="/admin/inbox" className={`chip-soft${archived ? "" : " coral"}`} aria-current={archived ? undefined : "page"}>الوارد{!archived && unread ? ` · ${arNumber(unread)} جديد` : ""}</Link>
      <Link href="/admin/inbox?box=archived" className={`chip-soft${archived ? " coral" : ""}`} aria-current={archived ? "page" : undefined}>المؤرشف</Link>
    </nav>
    <section className="card">
      {error ? <p className="empty">تعذر تحميل الرسائل الحين. حاول بعد قليل.</p>
        : rows.length ? <ul className="records inbox-list">{rows.map(row => <li key={row.id} className={`inbox-row${row.read_at ? "" : " unread"}`}>
          <Link href={`/admin/inbox/${row.id}`} className="inbox-link">
            <span className="inbox-from">{row.from_name || row.from_email}{row.attachments ? <span className="hint"> · 📎 {arNumber(row.attachments)}</span> : null}</span>
            <span className="inbox-subject">{row.subject || "(بدون عنوان)"}</span>
            <span className="hint inbox-preview">{row.preview}</span>
            <span className="hint inbox-date">{formatDate(row.received_at)}</span>
          </Link>
        </li>)}</ul>
        : <p className="empty">{archived ? "ما فيه رسائل مؤرشفة." : "ما وصل شي جديد. إذا طال الوقت، تأكد إن سكربت الربط في حساب جيميل شغّال."}</p>}
    </section>
  </>;
}
