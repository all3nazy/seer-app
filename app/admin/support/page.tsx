import Link from "next/link";
import { requestSession } from "../../../lib/supabase/server";
import { AdminSupportLive } from "../../../components/admin-support-live";

export const dynamic = "force-dynamic";
export const metadata = { title: "الدعم" };

type Row = { id: string; subject: string; status: string; organization: string; user_name: string | null; user_email: string | null; page: string | null; last_sender: string; last_message_at: string; messages: number };
const when = (iso: string) => new Date(iso).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Every ticket: open ones first, those waiting for the team at the top. Updates live. */
export default async function AdminSupportPage() {
  const { client } = await requestSession();
  const { data, error } = await client.rpc("admin_support_threads");
  const rows = (data ?? []) as Row[];
  const open = rows.filter(row => row.status === "open");
  const waiting = open.filter(row => row.last_sender === "user").length;
  return <>
    <AdminSupportLive />
    <header className="page-head"><div><h1>الدعم</h1><p>{open.length.toLocaleString("ar-SA")} تذكرة مفتوحة، منها {waiting.toLocaleString("ar-SA")} بانتظار ردّك.</p></div><Link className="btn" href="/admin/support/templates">قوالب الرد</Link></header>
    {error ? <p className="info-banner" role="alert">تعذر تحميل التذاكر. حدّث الصفحة.</p> : null}
    <section className="card">
      {rows.length ? <ul className="records">{rows.map(row => <li key={row.id}>
        <Link href={`/admin/support/${row.id}`} className="support-row">
          <span><strong>{row.subject}</strong>
            <span className="hint" style={{ display: "block" }}>{row.organization} · {row.user_name || row.user_email || "مستخدم"} · {row.messages.toLocaleString("ar-SA")} رسالة · {when(row.last_message_at)}</span></span>
          <span className={`chip-soft ${row.status === "closed" ? "" : row.last_sender === "user" ? "coral" : "ok"}`}>{row.status === "closed" ? "مغلقة" : row.last_sender === "user" ? "بانتظار ردّك" : "رديت عليها"}</span>
        </Link>
      </li>)}</ul> : <p className="empty">ما فيه تذاكر.</p>}
    </section>
  </>;
}
