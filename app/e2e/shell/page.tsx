import { notFound } from "next/navigation";
import { AppShell } from "../../../components/app-shell";
import { SupportMenuRow } from "../../../components/support-menu";
import { E2ESupportControls } from "../../../components/e2e-support-controls";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
const ids = (n: number) => Array.from({ length: n }, (_, index) => `00000000-0000-0000-0000-00000000000${index + 1}`);

/** Browser-test page: the real dashboard shell with given unread support threads. Only when SEER_E2E=1. */
export default async function ShellTestPage({ searchParams }: { searchParams: Promise<{ admin?: string; replies?: string; waiting?: string }> }) {
  if (process.env.SEER_E2E !== "1") notFound();
  const params = await searchParams;
  const admin = params.admin === "1";
  const support = { mine: ids(Number(params.replies ?? 0)), team: admin ? ids(Number(params.waiting ?? 0)) : null };
  return <AppShell stage="school" organizations={[]} platformAdmin={admin} support={support}>
    <h1>صفحة اختبار</h1>
    <div className="group"><SupportMenuRow admin={admin} /></div>
    <E2ESupportControls />
  </AppShell>;
}
