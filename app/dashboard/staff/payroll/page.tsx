import Link from "next/link";
import { loadOrgContext } from "../../../../lib/org-context";
import { OrgUnavailable } from "../../../../components/org-unavailable";
import { PayrollAdjust, PayrollApprove, PayrollGenerate } from "../../../../components/hr-forms";
import { PrintButton } from "../../../../components/print-button";
import { sar } from "../../../../lib/finance";
import { riyadhToday } from "../../../../lib/students";

export const dynamic = "force-dynamic";
export const metadata = { title: "الرواتب" };
type Line = { id: string; full_name: string; job_title: string | null; iban: string | null; basic: number; allowances: number; unpaid_days: number; absence_days: number; absence_deduction: number; gosi_deduction: number; other_deduction: number; bonus: number; net: number };

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ org?: string; month?: string }> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager } = context;
  if (!manager) return <section className="card"><h1>الرواتب</h1><p>لمالك المنشأة أو مديرها فقط.</p></section>;
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : riyadhToday().slice(0, 7);
  const orgParam = encodeURIComponent(org);
  const { data: runRow } = await client.from("payroll_runs").select("id,status,total_gross,total_deductions,total_net,approved_at").eq("organization_id", org).eq("period", `${month}-01`).maybeSingle();
  const run = runRow as { id: string; status: string; total_gross: number; total_deductions: number; total_net: number; approved_at: string | null } | null;
  const { data: lineRows } = run ? await client.from("payroll_lines").select("id,full_name,job_title,iban,basic,allowances,unpaid_days,absence_days,absence_deduction,gosi_deduction,other_deduction,bonus,net").eq("run_id", run.id).order("full_name") : { data: [] };
  const lines = (lineRows ?? []) as Line[];
  const locked = run?.status === "approved";
  const label = new Date(`${month}-01`).toLocaleDateString("ar-SA", { timeZone: "UTC", month: "long", year: "numeric" });
  return <>
    <header className="page-head no-print"><div>
      <p className="hint"><Link href={`/dashboard/staff?org=${orgParam}`}>الموظفين</Link> / الرواتب</p>
      <h1>رواتب {label}</h1><p>تُحسب من ملفات الموظفين، وتخصم الإجازات بدون راتب والغياب وحصة التأمينات. تقدر تضيف مكافأة أو خصمًا قبل الاعتماد.</p>
    </div></header>
    <form className="toolbar no-print" style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginBottom: 16 }}>
      <input type="hidden" name="org" value={org} /><label>الشهر<input type="month" name="month" defaultValue={month} /></label><button type="submit" className="btn">عرض</button>
      {!locked ? <PayrollGenerate organizationId={org} month={month} exists={Boolean(run)} /> : null}
      {run && !locked && lines.length ? <PayrollApprove organizationId={org} runId={run.id} /> : null}
      {locked ? <><span className="chip-soft ok">معتمدة</span><a className="btn" href={`/dashboard/staff/payroll/export?org=${orgParam}&month=${month}`}>ملف التحويل البنكي (CSV)</a><PrintButton /></> : null}
    </form>
    {run ? <>
      <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", marginBottom: 20 }}>
        <div className="stat lilac"><span className="label">الإجمالي</span><span className="figure" style={{ fontSize: 22 }}>{sar(run.total_gross)}</span></div>
        <div className="stat rose"><span className="label">الخصومات</span><span className="figure" style={{ fontSize: 22 }}>{sar(run.total_deductions)}</span></div>
        <div className="stat mint"><span className="label">صافي الرواتب</span><span className="figure" style={{ fontSize: 22 }}>{sar(run.total_net)}</span></div>
      </div>
      <section className="card payroll-sheet"><h2 className="print-only">{orgName} — رواتب {label}</h2><div className="table-wrap"><table className="links-table" style={{ width: "100%" }}>
        <thead><tr><th>الموظف</th><th>الأساسي</th><th>البدلات</th><th>غياب / بدون راتب</th><th>التأمينات</th><th>مكافأة / خصم</th><th>الصافي</th></tr></thead>
        <tbody>{lines.map(line => <tr key={line.id}>
          <td><strong>{line.full_name}</strong><span className="hint" style={{ display: "block" }}>{line.job_title ?? ""}</span></td>
          <td>{sar(line.basic)}</td><td>{sar(line.allowances)}</td>
          <td>{line.unpaid_days + line.absence_days ? <>{(line.unpaid_days + line.absence_days).toLocaleString("ar-SA")} يوم · − {sar(line.absence_deduction)}</> : "—"}</td>
          <td>{Number(line.gosi_deduction) ? `− ${sar(line.gosi_deduction)}` : "—"}</td>
          <td><PayrollAdjust organizationId={org} lineId={line.id} bonus={line.bonus} deduction={line.other_deduction} locked={locked} /></td>
          <td><strong>{sar(line.net)}</strong></td>
        </tr>)}</tbody></table></div></section>
    </> : <p className="empty">ما حُسبت رواتب هذا الشهر بعد. اضغط «حساب رواتب الشهر».</p>}
  </>;
}
