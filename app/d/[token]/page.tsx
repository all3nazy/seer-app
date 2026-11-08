import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { FinanceDocument } from "../../../components/finance-document";
import { PrintButton } from "../../../components/print-button";
import { emptyProfile, type SharedDocument } from "../../../lib/documents";
import { PayNow } from "../../../components/pay-forms";


export const dynamic = "force-dynamic";
export const metadata = { title: "مستند", robots: { index: false, follow: false } };

/** A family's private view of one invoice or quote, opened from the link shared on WhatsApp. */
export default async function SharedDocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) notFound();
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("shared_document", { token });
  if (error || !data) notFound();
  const shared = data as SharedDocument;
  const profile = { ...emptyProfile(shared.organization.name), ...shared.organization };
  return <main className="shared-doc">
    <div className="doc-toolbar no-print"><PrintButton /></div>
    {shared.pay ? <PayNow token={token} methods={shared.pay.methods} test={shared.pay.mode === "test"} /> : null}
    <FinanceDocument kind={shared.kind} profile={profile} doc={shared.document} lines={shared.lines} payments={shared.payments} />
    <p className="shared-note no-print">هذا رابط خاص بك. لا تشاركه مع غيرك.</p>
  </main>;
}
