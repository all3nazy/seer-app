import { notFound } from "next/navigation";
import { SupportThread } from "../../../components/support-thread";
import type { SupportTemplate } from "../../../lib/support-templates";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

const templates: SupportTemplate[] = [
  { id: 5, title: "تسجيل الحضور", body: "من «الحضور»:\n١. اختر الفصل والتاريخ.", path: "/dashboard/attendance", keywords: ["حضور"], sort_order: 50, is_active: true, suggested: true },
  { id: 1, title: "إضافة موظف أو مستخدم", body: "افتح «الفريق» واضغط «إنشاء رابط انضمام».", path: "/dashboard/team", keywords: [], sort_order: 10, is_active: true, suggested: false },
];

/** Browser-test page for a support conversation (links and «إدراج قالب»). Only when SEER_E2E=1. */
export default async function SupportThreadTestPage({ searchParams }: { searchParams: Promise<{ side?: string }> }) {
  if (process.env.SEER_E2E !== "1") notFound();
  const { side } = await searchParams;
  const admin = side === "admin";
  return <main className="main" id="main-content"><h1>تذكرة</h1><section className="card">
    <SupportThread threadId="00000000-0000-0000-0000-0000000000e2" initialStatus="open" side={admin ? "admin" : "user"} site="https://seersa.vercel.app"
      templates={admin ? templates : []}
      initialMessages={[
        { id: "m1", body: "الحضور ما ينحفظ", from_admin: false, created_at: "2026-11-12T08:00:00Z" },
        { id: "m2", body: "جرّب من هنا:\n🔗 https://seersa.vercel.app/dashboard/attendance\nأو هذا الموقع https://evil.test/dashboard", from_admin: true, created_at: "2026-11-12T08:05:00Z" },
      ]} />
  </section></main>;
}
