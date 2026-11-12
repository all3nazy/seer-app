import { notFound } from "next/navigation";
import { BackLink } from "../../../components/back-link";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Browser-test page for BackLink. Only when SEER_E2E=1. */
export default async function BackTestPage({ searchParams }: { searchParams: Promise<{ history?: string }> }) {
  if (process.env.SEER_E2E !== "1") notFound();
  const { history } = await searchParams;
  return <main className="main"><BackLink href="/e2e/back-from?fallback=1" label="رجوع إلى القائمة" history={history === "1"} /><h1>تفاصيل</h1></main>;
}
