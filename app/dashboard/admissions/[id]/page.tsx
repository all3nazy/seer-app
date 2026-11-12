import Link from "next/link";
import { notFound } from "next/navigation";
import { loadOrgContext } from "../../../../lib/org-context";
import { OrgUnavailable } from "../../../../components/org-unavailable";
import { ConvertForm, DeleteApplicationButton, ReviewForm } from "../../../../components/admission-forms";
import { applicationStatusLabels, applicationStatusTone, type Application } from "../../../../lib/admissions";
import { sectionLabel } from "../../../../lib/academics";
import { age, genderLabels } from "../../../../lib/students";
import { uuid } from "../../../../lib/operations";
import { relationshipLabels, type Relationship } from "../../../../lib/team";
import { BackLink } from "../../../../components/back-link";

export const dynamic = "force-dynamic";
export const metadata = { title: "طلب التحاق" };

function Field({ label, value, ltr }: { label: string; value: string | null | undefined; ltr?: boolean }) {
  return <div><dt className="hint">{label}</dt><dd style={{ margin: "2px 0 0", fontWeight: 500 }} dir={ltr && value ? "ltr" : undefined}>{value || "—"}</dd></div>;
}

export default async function ApplicationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ org?: string }> }) {
  const [{ id: rawId }, { org: requestedOrg }] = await Promise.all([params, searchParams]);
  let id: string;
  try { id = uuid(rawId); } catch { notFound(); }
  const context = await loadOrgContext(requestedOrg);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, manager } = context;
  if (!manager) return <section className="card"><h1>طلب التحاق</h1><p>طلبات الالتحاق لمسؤول المنشأة فقط.</p></section>;
  const { data, error } = await client.from("applications").select("id,reference,child_name,child_birth_date,child_gender,grade_level_id,guardian_name,guardian_phone,guardian_email,relationship,family_notes,status,interview_at,staff_notes,child_id,created_at").eq("organization_id", org).eq("id", id).maybeSingle();
  if (error) return <section className="card"><h1>تعذر تحميل الطلب</h1><p role="alert">أعد تحميل الصفحة.</p></section>;
  if (!data) notFound();
  const app = data as Application;
  const [grades, sections] = await Promise.all([
    client.from("grade_levels").select("id,name").eq("organization_id", org).order("sort_order"),
    client.from("sections").select("id,name,grade_level_id").eq("organization_id", org).order("name"),
  ]);
  const gradeRows = (grades.data ?? []) as { id: string; name: string }[];
  const sectionRows = (sections.data ?? []) as { id: string; name: string; grade_level_id: string }[];
  // Offer the requested grade's sections first.
  const sectionOptions = [...sectionRows].sort((a, b) => Number(b.grade_level_id === app.grade_level_id) - Number(a.grade_level_id === app.grade_level_id)).map(item => ({ id: item.id, name: sectionLabel(item, gradeRows) }));
  const orgParam = encodeURIComponent(org);
  return <div style={{ display: "grid", gap: 24 }}>
    <BackLink href={`/dashboard/admissions?org=${orgParam}`} label="رجوع إلى القبول والتسجيل" />
    <header className="page-head" style={{ marginBottom: 0 }}>
      <div>
        <p className="hint"><Link href={`/dashboard/admissions?org=${orgParam}`}>القبول والتسجيل</Link> / طلب <span dir="ltr">{app.reference}</span></p>
        <h1>{app.child_name}</h1>
        <p><span className={`chip-soft ${applicationStatusTone[app.status]}`}>{applicationStatusLabels[app.status]}</span> · وصل {new Date(app.created_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" })}</p>
      </div>
      {app.status === "rejected" || app.status === "withdrawn" ? <DeleteApplicationButton organizationId={org} applicationId={app.id} /> : null}
    </header>
    <section className="card" aria-labelledby="child-title">
      <h2 id="child-title">الطفل</h2>
      <dl className="field-row" style={{ margin: "12px 0 0" }}>
        <Field label="تاريخ الميلاد" value={app.child_birth_date ? `${new Date(app.child_birth_date).toLocaleDateString("ar-SA", { timeZone: "UTC" })} (${age(app.child_birth_date) ?? ""})` : null} />
        <Field label="الجنس" value={app.child_gender === "male" || app.child_gender === "female" ? genderLabels[app.child_gender] : null} />
        <Field label="الصف المطلوب" value={gradeRows.find(grade => grade.id === app.grade_level_id)?.name} />
      </dl>
    </section>
    <section className="card" aria-labelledby="family-title">
      <h2 id="family-title">ولي الأمر</h2>
      <dl className="field-row" style={{ margin: "12px 0 0" }}>
        <Field label="الاسم" value={`${app.guardian_name} (${relationshipLabels[app.relationship as Relationship] ?? app.relationship})`} />
        <div><dt className="hint">الجوال</dt><dd style={{ margin: "2px 0 0" }}><a href={`tel:${app.guardian_phone}`} dir="ltr">{app.guardian_phone}</a></dd></div>
        <Field label="البريد" value={app.guardian_email} ltr />
      </dl>
      {app.family_notes ? <p style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{app.family_notes}</p> : null}
    </section>
    {app.child_id ? <section className="card"><h2>تم التسجيل</h2><p>تحوّل هذا الطلب لملف طالب.</p><Link href={`/dashboard/children/${app.child_id}?org=${orgParam}`}>فتح ملف الطالب</Link></section> : <>
      <section className="card" aria-labelledby="review-title">
        <h2 id="review-title">المراجعة</h2>
        <ReviewForm organizationId={org} application={app} grades={gradeRows} />
      </section>
      {app.status !== "rejected" && app.status !== "withdrawn" ? <section className="card" aria-labelledby="convert-title">
        <h2 id="convert-title">التسجيل طالبًا</h2>
        <p>ينشئ ملف الطالب، ويضيف ولي الأمر (أو يربطه إذا رقمه مسجّل من قبل)، ويسجّل طلب تسجيل مقبول.</p>
        <ConvertForm organizationId={org} applicationId={app.id} sections={sectionOptions} />
      </section> : null}
    </>}
  </div>;
}
