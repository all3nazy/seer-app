import { notFound } from "next/navigation";
import { AdminShell } from "../../../components/admin-shell";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Browser-test page: the «سِير أدمن» shell with sample counts (the real console needs an aal2 session). Only when SEER_E2E=1. */
export default function AdminShellTestPage() {
  if (process.env.SEER_E2E !== "1") notFound();
  return <AdminShell userId="00000000-0000-0000-0000-0000000000e2" appUrl="http://127.0.0.1:3100" counts={{ payments: 3, support: 4, requests: 2 }} support={["1", "2", "3", "4"].map(n => `00000000-0000-0000-0000-00000000000${n}`)}>
    <header className="page-head"><div><h1>نظرة عامة</h1><p>صفحة اختبار.</p></div></header>
    <section className="card"><div className="table-wrap"><table className="links-table"><thead><tr><th>المنشأة</th><th>الباقة</th><th>الحالة</th><th>النهاية</th><th>الطلاب</th></tr></thead>
      <tbody><tr><td>روضة الاختبار</td><td>المتقدمة</td><td>نشط</td><td>2027-10-03</td><td>٤٠</td></tr></tbody></table></div></section>
  </AdminShell>;
}
