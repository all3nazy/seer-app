import Link from "next/link";
import { loadOrgContext } from "../../../../lib/org-context";
import { OrgUnavailable } from "../../../../components/org-unavailable";
import { BrandingStudio } from "../../../../components/document-forms";
import { loadProfile } from "../../../../lib/documents-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "هوية المستندات" };

export default async function BrandingPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org: requested } = await searchParams;
  const context = await loadOrgContext(requested);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager } = context;
  if (!manager) return <section className="card"><h1>هوية المستندات</h1><p>لمالك المنشأة أو مديرها فقط.</p></section>;
  const profile = await loadProfile(client, org, orgName);
  return <>
    <header className="page-head"><div>
      <p className="hint"><Link href={`/dashboard/finance?org=${encodeURIComponent(org)}`}>المالية</Link> / هوية المستندات</p>
      <h1>هوية المستندات</h1><p>شعار {orgName} وبياناتها الرسمية تظهر على كل فاتورة وإيصال وعرض سعر، وعلى الرابط اللي يوصل ولي الأمر.</p>
    </div></header>
    <BrandingStudio organizationId={org} profile={profile} />
  </>;
}
