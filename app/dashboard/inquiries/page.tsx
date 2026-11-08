import Link from "next/link";
import { redirect } from "next/navigation";
import { loadOrgContext } from "../../../lib/org-context";
import { OrgSwitcher, OrgUnavailable } from "../../../components/org-unavailable";
import { inquiryCategoryLabels, inquiryStatusLabels, inquiryStatusTone, isInquiryStatus, since, type Inquiry } from "../../../lib/inquiries";
import { memberName, type Member } from "../../../lib/team";

export const dynamic = "force-dynamic";
export const metadata = { title: "استفسارات الموظفين" };

export default async function InquiriesPage({ searchParams }: { searchParams: Promise<{ org?: string; status?: string }> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, organizations, manager, userId } = context;
  if (!manager) redirect(`/dashboard/my?org=${encodeURIComponent(org)}`);
  const status = isInquiryStatus(params.status) ? params.status : "open";
  const [list, counts, members] = await Promise.all([
    client.from("inquiries").select("id,author_id,category,subject,body,task_id,status,created_at,updated_at").eq("organization_id", org).eq("status", status).order("updated_at", { ascending: false }).limit(200),
    client.from("inquiries").select("status").eq("organization_id", org).neq("status", "closed").limit(1000),
    client.from("memberships").select("user_id,role,display_name").eq("organization_id", org),
  ]);
  const memberRows = (members.data ?? []) as Member[];
  const openCount = ((counts.data ?? []) as { status: string }[]).filter(row => row.status === "open").length;
  const orgParam = encodeURIComponent(org);
  return <>
    <header className="page-head">
      <div><h1>استفسارات الموظفين</h1><p>طلبات واستفسارات فريق {orgName} للإدارة.</p></div>
      <OrgSwitcher path="/dashboard/inquiries" current={org} organizations={organizations} />
    </header>
    <nav className="segments" aria-label="حالة الاستفسار">
      {(["open", "answered", "closed"] as const).map(item => <Link key={item} href={`/dashboard/inquiries?org=${orgParam}&status=${item}`} aria-current={item === status ? "page" : undefined}>{inquiryStatusLabels[item]}{item === "open" && openCount ? ` (${openCount.toLocaleString("ar-SA")})` : ""}</Link>)}
    </nav>
    {list.error ? <p role="alert" className="info-banner">تعذر تحميل الاستفسارات.</p> : (list.data ?? []).length ? <div className="list">
      {((list.data ?? []) as Inquiry[]).map(item => <Link key={item.id} className="list-row" href={`/dashboard/inquiries/${item.id}?org=${orgParam}`}>
        <span className="body"><span className="title">{item.subject}</span>
          <span className="sub">{memberName(memberRows.find(member => member.user_id === item.author_id), item.author_id === userId)} · {inquiryCategoryLabels[item.category]} · {since(item.updated_at)}</span></span>
        <span className={`chip-soft ${inquiryStatusTone[item.status]}`}>{inquiryStatusLabels[item.status]}</span>
      </Link>)}
    </div> : <p className="empty">{status === "open" ? "ما فيه استفسارات تنتظر ردك." : "ما فيه استفسارات بهذه الحالة."}</p>}
  </>;
}
