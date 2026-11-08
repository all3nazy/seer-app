import Link from "next/link";
import { loadOrgContext } from "../../../../lib/org-context";
import { OrgUnavailable } from "../../../../components/org-unavailable";
import { QuoteForm } from "../../../../components/document-forms";
import { quoteStatusLabels, quoteStatusTone, type QuoteStatus } from "../../../../lib/documents";
import { sar, type FeeKind } from "../../../../lib/finance";
import { riyadhToday } from "../../../../lib/students";

export const dynamic = "force-dynamic";
export const metadata = { title: "عروض الأسعار" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ org?: string; new?: string }> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager } = context;
  if (!manager) return <section className="card"><h1>عروض الأسعار</h1><p>لمالك المنشأة أو مديرها فقط.</p></section>;
  const orgParam = encodeURIComponent(org);
  const [quotes, items, discounts, guardians, students] = await Promise.all([
    client.from("quotes").select("id,number,status,title,total,guardian_id,recipient_name,valid_until,created_at").eq("organization_id", org).order("created_at", { ascending: false }).limit(100),
    client.from("fee_items").select("id,name,kind,default_amount,vat_rate").eq("organization_id", org).eq("is_active", true).order("kind").order("name"),
    client.from("discounts").select("id,name,kind,value").eq("organization_id", org).eq("is_active", true).order("name"),
    client.from("guardians").select("id,full_name").eq("organization_id", org).order("full_name").limit(1000),
    client.from("children").select("id,full_name").eq("organization_id", org).order("full_name").limit(1000),
  ]);
  const guardianName = new Map(((guardians.data ?? []) as { id: string; full_name: string }[]).map(row => [row.id, row.full_name]));
  const rows = (quotes.data ?? []) as { id: string; number: number | null; status: QuoteStatus; title: string; total: number; guardian_id: string | null; recipient_name: string | null; valid_until: string | null }[];
  const today = riyadhToday();
  const validDefault = new Date(Date.parse(today) + 14 * 86400_000).toISOString().slice(0, 10);
  const open = rows.filter(row => row.status === "sent" || row.status === "accepted");
  return <>
    <header className="page-head"><div>
      <p className="hint"><Link href={`/dashboard/finance?org=${orgParam}`}>المالية</Link> / عروض الأسعار</p>
      <h1>عروض الأسعار</h1><p>عروض {orgName} للأسر من كتالوج الرسوم والخصومات، تنشارك بالواتساب وتتحوّل لفاتورة بضغطة.</p>
    </div><Link className="btn" href={`/dashboard/finance/branding?org=${orgParam}`}>هوية المستندات</Link></header>
    <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", marginBottom: 20 }}>
      <div className="stat lilac"><span className="label">كل العروض</span><span className="figure">{rows.length.toLocaleString("ar-SA")}</span></div>
      <div className="stat sky"><span className="label">بانتظار الرد</span><span className="figure">{open.length.toLocaleString("ar-SA")}</span></div>
      <div className="stat mint"><span className="label">قيمة المفتوحة</span><span className="figure" style={{ fontSize: 22 }}>{sar(open.reduce((sum, row) => sum + Number(row.total), 0))}</span></div>
      <div className="stat peach"><span className="label">تحوّلت لفواتير</span><span className="figure">{rows.filter(row => row.status === "invoiced").length.toLocaleString("ar-SA")}</span></div>
    </div>
    <section className="card" style={{ marginBottom: 20 }}>
      <details open={params.new === "1" || !rows.length}><summary><strong>عرض سعر جديد</strong></summary>
        <div style={{ marginTop: 14 }}><QuoteForm organizationId={org} items={(items.data ?? []) as { id: string; name: string; kind: FeeKind; default_amount: number; vat_rate: number }[]}
          discounts={((discounts.data ?? []) as { id: string; name: string; kind: "percent" | "fixed"; value: number }[])}
          guardians={((guardians.data ?? []) as { id: string; full_name: string }[]).map(row => ({ id: row.id, name: row.full_name }))}
          students={((students.data ?? []) as { id: string; full_name: string }[]).map(row => ({ id: row.id, name: row.full_name }))} defaultValid={validDefault} /></div>
      </details>
    </section>
    <section className="card" aria-labelledby="quotes-title">
      <h2 id="quotes-title">العروض</h2>
      {rows.length ? <div className="list">{rows.map(row => <Link key={row.id} className="list-row" href={`/dashboard/finance/quotes/${row.id}?org=${orgParam}`}>
        <span className="body"><span className="title">{row.number ? `عرض رقم ${row.number} — ` : "مسودة — "}{row.title}</span>
          <span className="sub">{[row.guardian_id ? guardianName.get(row.guardian_id) : row.recipient_name, row.valid_until ? `صالح حتى ${new Date(row.valid_until).toLocaleDateString("ar-SA", { timeZone: "UTC" })}` : null].filter(Boolean).join(" · ")}</span></span>
        <span style={{ display: "grid", justifyItems: "end", gap: 4 }}><strong>{sar(row.total)}</strong>
          <span className={`chip-soft ${row.status === "sent" && row.valid_until && row.valid_until < today ? "rose" : quoteStatusTone[row.status]}`}>{row.status === "sent" && row.valid_until && row.valid_until < today ? "منتهي" : quoteStatusLabels[row.status]}</span></span>
      </Link>)}</div> : <p className="empty">ما فيه عروض بعد. أنشئ أول عرض من فوق.</p>}
    </section>
  </>;
}
