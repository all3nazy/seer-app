import { loadOrgContext } from "../../../lib/org-context";
import { OrgSwitcher, OrgUnavailable } from "../../../components/org-unavailable";
import { AnnouncementForm, DeleteAnnouncement } from "../../../components/family-forms";
import { sectionLabel } from "../../../lib/academics";
import { audienceLabels, type Audience } from "../../../lib/family";
import { whatsappLink } from "../../../lib/share";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإعلانات" };

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager, organizations } = context;
  const [notices, sectionsResult, gradesResult] = await Promise.all([
    client.from("announcements").select("id,title,body,audience,section_id,pinned,created_at").eq("organization_id", org).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(100),
    client.from("sections").select("id,name,grade_level_id").eq("organization_id", org).order("name"),
    client.from("grade_levels").select("id,name").eq("organization_id", org).order("sort_order"),
  ]);
  const grades = (gradesResult.data ?? []) as { id: string; name: string }[];
  const sections = ((sectionsResult.data ?? []) as { id: string; name: string; grade_level_id: string }[]).map(item => ({ id: item.id, name: sectionLabel(item, grades) }));
  const rows = (notices.data ?? []) as { id: string; title: string; body: string; audience: Audience; section_id: string | null; pinned: boolean; created_at: string }[];
  return <>
    <header className="page-head">
      <div><h1>الإعلانات</h1><p>إعلانات {orgName} للموظفين وأولياء الأمور. إعلانات الأهالي تظهر في بوابة ولي الأمر تلقائيًا.</p></div>
      <OrgSwitcher path="/dashboard/announcements" current={org} organizations={organizations} />
    </header>
    {manager ? <section className="card" style={{ marginBottom: 20 }}><details open={!rows.length}><summary><strong>إعلان جديد</strong></summary><div style={{ marginTop: 14 }}><AnnouncementForm organizationId={org} sections={sections} /></div></details></section> : null}
    {rows.length ? <div className="notice-list">{rows.map(row => <article key={row.id} className={`card notice${row.pinned ? " pinned" : ""}`}>
      <header><h2>{row.pinned ? "📌 " : ""}{row.title}</h2>
        <span className="hint">{audienceLabels[row.audience]}{row.section_id ? ` · ${sections.find(item => item.id === row.section_id)?.name ?? "فصل"}` : ""} · {new Date(row.created_at).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", day: "numeric", month: "long" })}</span></header>
      <p>{row.body}</p>
      <div className="share-doc">
        <a className="btn btn-sm share-wa" href={whatsappLink(null, `📢 ${orgName}\n${row.title}\n\n${row.body}`)} target="_blank" rel="noopener noreferrer">مشاركة واتساب</a>
        {manager ? <DeleteAnnouncement organizationId={org} id={row.id} /> : null}
      </div>
    </article>)}</div> : <p className="empty">ما فيه إعلانات بعد.</p>}
  </>;
}
