import Link from "next/link";
import { loadOrgContext } from "../../../../lib/org-context";
import { OrgUnavailable } from "../../../../components/org-unavailable";
import { ImportStudents } from "../../../../components/import-students";

export const dynamic = "force-dynamic";
export const metadata = { title: "استيراد الطلاب" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const context = await loadOrgContext((await searchParams).org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager } = context;
  if (!manager) return <section className="card"><h1>استيراد الطلاب</h1><p>الاستيراد لمالك المنشأة أو مديرها.</p></section>;
  const [sections, grades] = await Promise.all([
    client.from("sections").select("name,grade_level_id").eq("organization_id", org),
    client.from("grade_levels").select("id,name").eq("organization_id", org),
  ]);
  const gradeName = new Map(((grades.data ?? []) as { id: string; name: string }[]).map(row => [row.id, row.name]));
  const names = ((sections.data ?? []) as { name: string; grade_level_id: string }[]).flatMap(row => [`${gradeName.get(row.grade_level_id) ?? ""} — ${row.name}`, row.name]);
  return <div style={{ maxWidth: 980 }}>
    <header className="page-head"><div>
      <p className="hint"><Link href={`/dashboard/children?org=${encodeURIComponent(org)}`}>الطلاب</Link> / استيراد</p>
      <h1>استيراد الطلاب وأولياء الأمور</h1><p>أضف طلاب {orgName} دفعة وحدة من ملف Excel: كل طالب مع فصله وولي أمره وجواله.</p>
    </div></header>
    <ImportStudents organizationId={org} sectionNames={names} />
  </div>;
}
