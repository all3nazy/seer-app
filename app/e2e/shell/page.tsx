import { notFound } from "next/navigation";
import { AppShell } from "../../../components/app-shell";
import { SupportMenuRow } from "../../../components/support-menu";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Browser-test page: the real dashboard shell with given support counts. Only when SEER_E2E=1. */
export default async function ShellTestPage({ searchParams }: { searchParams: Promise<{ admin?: string; replies?: string; waiting?: string }> }) {
  if (process.env.SEER_E2E !== "1") notFound();
  const params = await searchParams;
  const admin = params.admin === "1";
  const support = { replies: Number(params.replies ?? 0), waiting: admin ? Number(params.waiting ?? 0) : null };
  return <AppShell stage="school" organizations={[]} platformAdmin={admin} support={support}>
    <h1>صفحة اختبار</h1>
    <div className="group"><SupportMenuRow admin={admin} count={admin ? support.waiting ?? 0 : support.replies} /></div>
  </AppShell>;
}
