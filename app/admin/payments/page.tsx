import Link from "next/link";
import { requestSession } from "../../../lib/supabase/server";
import { PaymentDecision } from "../../../components/admin-forms";
import { durationLabel, riyal } from "../../../lib/subscriptions";

export const metadata = { title: "التحويلات المعلّقة" };
type Pending = { id: string; organization_id: string; organization: string; plan: string; months: number; amount: number; expected: number | null; reference: string; receipt_path: string; created_at: string };

/** Pending transfers with their receipt (a short-lived private link) and the expected amount. */
export default async function AdminPayments() {
  const { client } = await requestSession();
  const { data } = await client.rpc("admin_pending_payments");
  const rows = (data ?? []) as Pending[];
  const links = await Promise.all(rows.map(row => client.storage.from("subscription-receipts").createSignedUrl(row.receipt_path, 600).then(result => result.data?.signedUrl ?? null).catch(() => null)));
  return <>
    <header className="page-head"><div><h1>التحويلات المعلّقة</h1><p>راجع الإيصال والمبلغ ثم اعتمد أو ارفض مع السبب.</p></div></header>
    {rows.length ? <div className="admin-payments">{rows.map((row, index) => <article key={row.id} className="card admin-payment">
      <div className="admin-payment-body">
        <h2 style={{ margin: 0, fontSize: 18 }}><Link href={`/admin/subscribers/${row.organization_id}`}>{row.organization}</Link></h2>
        <p style={{ margin: 0 }}>{row.plan} · {durationLabel(row.months)}</p>
        <p style={{ margin: 0 }}>المبلغ المطلوب: <strong>{riyal(row.amount)}</strong>{row.expected !== null && Number(row.expected) !== Number(row.amount) ? <span className="chip-soft rose"> السعر الحالي {riyal(Number(row.expected))}</span> : null}</p>
        <p className="hint" style={{ margin: 0 }}>المرجع: <span dir="ltr">{row.reference}</span> · {new Date(row.created_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</p>
        <PaymentDecision id={row.id} />
      </div>
      {links[index] ? (row.receipt_path.endsWith(".pdf")
        ? <a className="btn" href={links[index]!} target="_blank" rel="noopener noreferrer">فتح الإيصال (PDF)</a>
        // eslint-disable-next-line @next/next/no-img-element
        : <a href={links[index]!} target="_blank" rel="noopener noreferrer"><img className="receipt-thumb" src={links[index]!} alt={`إيصال ${row.organization}`} /></a>) : <p className="hint">تعذر عرض الإيصال.</p>}
    </article>)}</div> : <p className="empty">ما فيه تحويلات معلّقة. 👍</p>}
  </>;
}
