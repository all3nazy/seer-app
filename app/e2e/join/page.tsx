import { notFound } from "next/navigation";
import { JoinRequestForm } from "../../../components/join-request-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Browser-test page for the home page's join form (the home page shows it in pilot mode). Only when SEER_E2E=1. */
export default function JoinTestPage() {
  if (process.env.SEER_E2E !== "1") notFound();
  return <main className="lp"><section className="lp-join" id="join"><h2>تبي تنضم للتجربة؟</h2><JoinRequestForm /></section></main>;
}
