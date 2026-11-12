import Link from "next/link";
import { notFound } from "next/navigation";
import { loadOrgContext } from "../../../../lib/org-context";
import { OrgUnavailable } from "../../../../components/org-unavailable";
import { InquiryStatusButtons, ReplyForm } from "../../../../components/work-forms";
import { inquiryCategoryLabels, inquiryStatusLabels, inquiryStatusTone, since, type Inquiry, type Reply } from "../../../../lib/inquiries";
import { memberName, type Member } from "../../../../lib/team";
import { uuid } from "../../../../lib/operations";
import { BackLink } from "../../../../components/back-link";

export const dynamic = "force-dynamic";
export const metadata = { title: "استفسار" };

export default async function InquiryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ org?: string }> }) {
  const [{ id: rawId }, { org: requestedOrg }] = await Promise.all([params, searchParams]);
  let id: string;
  try { id = uuid(rawId); } catch { notFound(); }
  const context = await loadOrgContext(requestedOrg);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, userId, manager } = context;
  const [inquiry, replies, members] = await Promise.all([
    client.from("inquiries").select("id,author_id,category,subject,body,task_id,status,created_at,updated_at").eq("organization_id", org).eq("id", id).maybeSingle(),
    client.from("inquiry_replies").select("id,author_id,body,created_at").eq("organization_id", org).eq("inquiry_id", id).order("created_at").limit(200),
    client.from("memberships").select("user_id,role,display_name").eq("organization_id", org),
  ]);
  if (inquiry.error) return <section className="card"><h1>تعذر تحميل الاستفسار</h1><p role="alert">أعد تحميل الصفحة.</p></section>;
  if (!inquiry.data) notFound();
  const item = inquiry.data as Inquiry;
  const memberRows = (members.data ?? []) as Member[];
  const name = (user: string | null) => memberName(memberRows.find(member => member.user_id === user), user === userId);
  const orgParam = encodeURIComponent(org);
  const message = (author: string | null, body: string, at: string, key: string) => <li key={key} style={{ display: "grid", gap: 4, padding: 12, borderRadius: 14, background: author === item.author_id ? "var(--surface-2)" : "var(--tint-lilac)" }}>
    <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{name(author)}{author !== item.author_id ? " (الإدارة)" : ""}</strong><span className="hint">{since(at)}</span></span>
    <span style={{ whiteSpace: "pre-wrap" }}>{body}</span>
  </li>;
  return <div style={{ display: "grid", gap: 24, maxWidth: 760 }}>
    <BackLink href={`/dashboard/inquiries?org=${orgParam}`} label="رجوع إلى الاستفسارات" history />
    <header className="page-head" style={{ marginBottom: 0 }}>
      <div>
        <p className="hint"><Link href={manager ? `/dashboard/inquiries?org=${orgParam}` : `/dashboard/my?org=${orgParam}`}>{manager ? "استفسارات الموظفين" : "مهامي"}</Link></p>
        <h1>{item.subject}</h1>
        <p><span className={`chip-soft ${inquiryStatusTone[item.status]}`}>{inquiryStatusLabels[item.status]}</span> · {inquiryCategoryLabels[item.category]}
          {item.task_id ? <> · <Link href={`/dashboard/tasks/${item.task_id}?org=${orgParam}`}>المهمة المرتبطة</Link></> : null}</p>
      </div>
      <InquiryStatusButtons organizationId={org} inquiryId={item.id} status={item.status} manager={manager} />
    </header>
    <section className="card" aria-label="المحادثة">
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "grid", gap: 12 }}>
        {message(item.author_id, item.body, item.created_at, "original")}
        {((replies.data ?? []) as Reply[]).map(reply => message(reply.author_id, reply.body, reply.created_at, reply.id))}
      </ul>
      {item.status === "closed" ? <p className="hint">الاستفسار مغلق.{manager ? " أعد فتحه للرد." : ""}</p> : <ReplyForm organizationId={org} inquiryId={item.id} />}
    </section>
  </div>;
}
