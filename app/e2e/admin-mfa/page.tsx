import { notFound } from "next/navigation";
import { AdminMfa } from "../../../components/admin-mfa";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Browser-test page: the two-step verification step (the test answers Supabase Auth). Only when SEER_E2E=1. */
export default function AdminMfaTestPage() {
  if (process.env.SEER_E2E !== "1") notFound();
  return <main className="adm-auth" id="main-content"><section className="card adm-auth-card" aria-labelledby="verify-title"><AdminMfa /></section></main>;
}
