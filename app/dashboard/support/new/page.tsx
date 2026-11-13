import { requestMemberships } from "../../../../lib/supabase/server";
import { SupportNew } from "../../../../components/support-new";
import { ticketPage } from "../../../../lib/support";
import { BackLink } from "../../../../components/back-link";
import { helpBody, helpSubject, isStepKey } from "../../../../lib/onboarding";

export const dynamic = "force-dynamic";
export const metadata = { title: "تذكرة دعم جديدة" };

/** A new ticket; ?from= is the page the person came from (path only); ?step= a setup step they need help with. */
export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ from?: string; step?: string }> }) {
  const [{ from, step }, memberships] = await Promise.all([searchParams, requestMemberships()]);
  const organizations = memberships.data.map(item => ({ id: item.organization_id, name: item.organizations?.name ?? "منشأة" }));
  return <div style={{ maxWidth: 640 }}>
    <BackLink href="/dashboard/support" label="رجوع إلى تذاكري" />
    <header className="page-head"><div><h1>تكلّم مع فريق سِير</h1><p>اكتب مشكلتك أو سؤالك، ويرد عليك الفريق هنا داخل المنصة.</p></div></header>
    <section className="card"><SupportNew organizations={organizations} page={ticketPage(from)} {...(isStepKey(step) ? { initialSubject: helpSubject(step), initialText: helpBody(step) } : {})} /></section>
  </div>;
}
