import Link from "next/link";
import { loadOrgContext } from "../../../lib/org-context";
import { OrgUnavailable } from "../../../components/org-unavailable";
import { RecheckButton, RepairButton, ResolveError } from "../../../components/health-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "صحة النظام" };

type Check = { id: string; label: string; count: number; fixable: boolean; hint: string; href: string };
type ErrorRow = { fingerprint: string; kind: string; message: string; route: string | null; count: number; first_seen: string; last_seen: string; status: string; resolution: string | null; regressed: boolean };
const kindLabels: Record<string, string> = { client: "المتصفح", server: "الخادم", action: "عملية", route: "رابط" };
const statusLabels: Record<string, string> = { new: "جديد", known: "معروف", resolved: "انحل", ignored: "متجاهل" };
const repairLabels: Record<string, string> = { messages_stuck: "إعادة رسائل عالقة", payments_stale: "إنهاء محاولات دفع معلّقة" };
const when = (iso: string) => new Date(iso).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" });

/** Live checks with one-click safe repairs, the grouped error log with learned fixes, and repair history. */
export default async function HealthPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const context = await loadOrgContext((await searchParams).org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager } = context;
  if (!manager) return <section className="card"><h1>صحة النظام</h1><p>لمالك المنشأة أو مديرها.</p></section>;
  const started = Date.now();
  const [health, errors, repairs] = await Promise.all([
    client.rpc("system_health", { org }),
    client.from("system_errors").select("fingerprint,kind,message,route,count,first_seen,last_seen,status,resolution,regressed").order("last_seen", { ascending: false }).limit(50),
    client.rpc("list_repairs", { org }),
  ]);
  const latency = Date.now() - started;
  const checks = (health.data ?? []) as Check[];
  const issues = checks.filter(check => check.count > 0);
  const errorRows = (errors.data ?? []) as ErrorRow[];
  const open = errorRows.filter(row => row.status === "new");
  const orgParam = encodeURIComponent(org);
  const link = (href: string) => `${href}${href.includes("?") ? "&" : "?"}org=${orgParam}`;
  return <div style={{ maxWidth: 980 }}>
    <header className="page-head"><div><h1>صحة النظام</h1><p>{orgName}: فحص فوري، وإصلاح آمن بضغطة، وسجل الأخطاء وحلولها. الإصلاحات الآمنة تشتغل تلقائيًا كل ربع ساعة.</p></div><RecheckButton /></header>
    <div className="stats">
      <div className={`stat ${health.error ? "peach" : "sky"}`}><span className="figure">{health.error ? "تعذر" : `${latency.toLocaleString("ar-SA")} ms`}</span><span className="label">قاعدة البيانات {health.error ? "لا تستجيب" : "تعمل"}</span></div>
      <div className={`stat ${issues.length ? "peach" : "sky"}`}><span className="figure">{issues.length ? issues.length.toLocaleString("ar-SA") : "✓"}</span><span className="label">{issues.length ? "بنود تحتاج انتباه" : "كل الفحوص سليمة"}</span></div>
      <div className={`stat ${open.length ? "peach" : "sky"}`}><span className="figure">{open.length.toLocaleString("ar-SA")}</span><span className="label">أخطاء جديدة تحتاج مراجعة</span></div>
    </div>
    <section className="card" style={{ marginTop: 16 }}><h2>الفحوص</h2>
      <ul className="health-list">{checks.map(check => <li key={check.id} className={check.count ? (check.fixable ? "warn" : "info") : "ok"}>
        <span className="health-dot" aria-hidden="true" />
        <span className="grow"><strong>{check.label}</strong>{check.count ? <span className="hint" style={{ display: "block" }}>{check.hint}</span> : null}</span>
        <span className="chip-soft">{check.count ? check.count.toLocaleString("ar-SA") : "سليم"}</span>
        {check.count && check.fixable ? <RepairButton organizationId={org} checkId={check.id} /> : check.count ? <Link className="btn btn-sm" href={link(check.href)}>فتح</Link> : null}
      </li>)}</ul>
    </section>
    <section className="card" style={{ marginTop: 16 }} id="errors"><h2>سجل الأخطاء</h2>
      <p className="hint">كل خطأ ينسجل مرة وحدة مع عدد تكراره، بدون أي بيانات شخصية. اكتب الحل إذا عرفت السبب: يظهر للمستخدم إذا تكرر، وإذا رجع خطأ «انحل» ينفتح تلقائيًا.</p>
      {errorRows.length ? <ul className="records">{errorRows.map(row => <li key={row.fingerprint} style={{ display: "block" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span><strong dir="auto">{row.message}</strong><span className="hint" style={{ display: "block" }}>{kindLabels[row.kind] ?? row.kind}{row.route ? ` · ${row.route}` : ""} · {row.count.toLocaleString("ar-SA")} مرة · آخرها {when(row.last_seen)}</span></span>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>{row.regressed ? <span className="chip-soft rose">رجع بعد الحل</span> : null}<span className={`chip-soft ${row.status === "new" ? "rose" : row.status === "resolved" ? "ok" : ""}`}>{statusLabels[row.status] ?? row.status}</span></span>
        </div>
        {row.resolution ? <p className="hint" style={{ margin: "6px 0 0" }}>💡 {row.resolution}</p> : null}
        <ResolveError fingerprint={row.fingerprint} status={row.status} resolution={row.resolution} />
      </li>)}</ul> : <p className="empty">ما فيه أخطاء مسجّلة. 👍</p>}
    </section>
    <section className="card" style={{ marginTop: 16 }}><h2>سجل الإصلاحات</h2>
      {((repairs.data ?? []) as { check_id: string; fixed: number; automatic: boolean; created_at: string }[]).length
        ? <ul className="records">{((repairs.data ?? []) as { check_id: string; fixed: number; automatic: boolean; created_at: string }[]).map((row, index) => <li key={index}><span>{repairLabels[row.check_id] ?? row.check_id}: {row.fixed.toLocaleString("ar-SA")}</span><span className="hint">{row.automatic ? "تلقائي" : "يدوي"} · {when(row.created_at)}</span></li>)}</ul>
        : <p className="empty">ما احتاج النظام أي إصلاح بعد.</p>}
    </section>
  </div>;
}
