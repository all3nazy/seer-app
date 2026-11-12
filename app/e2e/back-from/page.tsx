import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/** Browser-test page: the page a person comes from before a detail page. Only when SEER_E2E=1. */
export default function BackFromTestPage() {
  if (process.env.SEER_E2E !== "1") notFound();
  return <main className="main"><h1>القائمة</h1><a href="/e2e/back?history=1">افتح التفاصيل</a></main>;
}
