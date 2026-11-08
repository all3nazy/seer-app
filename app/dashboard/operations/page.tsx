import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, sessionUser } from "../../../lib/supabase/server";
import { canManage, entities, entityLabels, isEntity, statusLabels, type Entity, type OperationRecord, type RecordOption } from "../../../lib/operations";
import { OperationForm, OrganizationForm } from "../../../components/operation-form";
import { FamilyLinks, type FamilyLink } from "../../../components/family-links";
import { auditEntityLabels as auditLabels } from "../../../lib/audit";

export const dynamic = "force-dynamic";
export const metadata = { title: "السجلات" };
const pageSize = 25;
const selections: Record<Entity, string> = {
  branches: "id,name", children: "id,full_name,date_of_birth", guardians: "id,full_name,phone",
  enrollments: "id,child_id,branch_id,status", invoices: "id,guardian_id,amount_sar,status",
};
type Organization = { name: string; type: string };
function operationUrl(org: string, entity: Entity, page = 1) { return `/dashboard/operations?${new URLSearchParams({ org, entity, page: String(page) })}`; }
function recordLabel(record: OperationRecord, options: RecordOption[]): string {
  if (record.name || record.full_name) return record.name ?? record.full_name ?? "";
  const related = options.find(option => option.id === (record.child_id ?? record.guardian_id));
  return [related?.name, record.amount_sar !== undefined ? `${Number(record.amount_sar).toLocaleString("ar-SA")} ر.س` : null].filter(Boolean).join(" — ") || "سجل";
}
export default async function Operations({ searchParams }: { searchParams: Promise<{ org?: string; entity?: string; page?: string }> }) {
  const client = await createSupabaseServerClient();
  const user = await sessionUser(client);
  if (!user) redirect("/login");
  const { data: memberships, error: membershipError } = await client.from("memberships").select("organization_id,role,organizations(name,type)").eq("user_id", user.id);
  if (membershipError) return <><h1>تعذر تحميل المنشآت</h1><p role="alert">حاول مجددًا لاحقًا.</p><Link href="/dashboard">العودة للوحة التشغيل</Link></>;
  const params = await searchParams;
  const member = memberships?.find(item => item.organization_id === params.org) ?? (!params.org ? memberships?.[0] : undefined);
  if (!member) return <section className="card"><h1>لا توجد منشأة متاحة</h1><p>تواصل مع مسؤول المنصة لربط حسابك بمنشأة.</p><Link href="/dashboard">العودة للوحة التشغيل</Link></section>;
  const org = member.organization_id as string;
  const organization = member.organizations as unknown as Organization | null;
  const manager = canManage(member.role);
  const visible = entities.filter(entity => entity !== "invoices" || manager);
  const entity = params.entity && isEntity(params.entity) && visible.includes(params.entity) ? params.entity : "branches";
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 10000 ? requestedPage : 1;
  const loadOptions = async (table: "branches" | "children" | "guardians") => {
    const column = table === "branches" ? "name" : "full_name";
    const result = await client.from(table).select(`id,${column}`).eq("organization_id", org).order(column).limit(500);
    return { error: result.error, options: (result.data as unknown as OperationRecord[] ?? []).map(row => ({ id: row.id, name: row.name ?? row.full_name ?? "سجل" })) };
  };
  // Load only references needed by the selected workflow; do not serialize children's
  // dates or guardian phones to enrollment/invoice forms.
  const [recordsResult, branchesResult, childrenResult, guardiansResult, auditResult] = await Promise.all([
    client.from(entity).select(selections[entity], { count: "exact" }).eq("organization_id", org).order("id").range((page - 1) * pageSize, page * pageSize - 1),
    entity === "enrollments" ? loadOptions("branches") : Promise.resolve({ error: null, options: [] as RecordOption[] }),
    entity === "enrollments" || entity === "children" ? loadOptions("children") : Promise.resolve({ error: null, options: [] as RecordOption[] }),
    entity === "invoices" || entity === "children" ? loadOptions("guardians") : Promise.resolve({ error: null, options: [] as RecordOption[] }),
    manager ? client.from("audit_events").select("id,entity,action,created_at").eq("organization_id", org).order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: null, error: null }),
  ]);
  // Family links are listed only on the children section; identifiers only, names come from the option lists.
  const linksResult = entity === "children" ? await client.from("child_guardians").select("child_id,guardian_id,relationship").eq("organization_id", org).limit(1000) : { data: null, error: null };
  const records = (recordsResult.data ?? []) as unknown as OperationRecord[];
  const total = recordsResult.count ?? 0;
  const referenceError = branchesResult.error || childrenResult.error || guardiansResult.error;
  return <>
    <header className="page-head">
      <div><h1>السجلات</h1><p>{organization?.name ?? "المنشأة"}: الفروع والأطفال وأولياء الأمور والتسجيل والفواتير.</p></div>
      {memberships && memberships.length > 1 ? <form className="toolbar">
        <label>المنشأة<select name="org" defaultValue={org}>{memberships.map(item => <option key={item.organization_id} value={item.organization_id}>{(item.organizations as unknown as Organization | null)?.name ?? "منشأة"}</option>)}</select></label>
        <button type="submit">عرض</button>
      </form> : null}
    </header>
    {!manager ? <p className="pill muted" style={{ width: "fit-content" }}>صلاحيتك للاطلاع. التعديل والفواتير لمسؤول المنشأة.</p> : null}
    <nav aria-label="أقسام العمليات" className="segments">
      {visible.map(item => <Link key={item} href={operationUrl(org, item)} aria-current={item === entity ? "page" : undefined}>{entityLabels[item]}</Link>)}
    </nav>
    <section className="card" aria-labelledby="records-title">
      <h2 id="records-title">{entityLabels[entity]}</h2>
      {entity === "invoices" ? <p className="info-banner" style={{ marginBottom: 12 }}>للفواتير بالبنود والضريبة والمدفوعات والإيصالات، استخدم <Link href={`/dashboard/finance?org=${encodeURIComponent(org)}&tab=invoices`}>صفحة المالية</Link>.</p> : null}
      {recordsResult.error ? <p role="alert">تعذر تحميل السجلات. أعد تحميل الصفحة أو حاول لاحقًا.</p> : <>
        <p className="pill muted" style={{ width: "fit-content" }}>إجمالي السجلات: {total.toLocaleString("ar-SA")}، الصفحة {page.toLocaleString("ar-SA")}</p>
        {records.length ? <ul className="records">{records.map(record => <li key={record.id}><span>{recordLabel(record, entity === "enrollments" ? childrenResult.options : guardiansResult.options)}</span>{record.status ? <span className="pill">{statusLabels[record.status] ?? record.status}</span> : null}</li>)}</ul> : <p>{page > 1 ? "لا توجد سجلات في هذه الصفحة." : "لا توجد سجلات بعد. يمكنك البدء بإضافة سجل جديد إذا كانت لديك صلاحية الإدارة."}</p>}
        <nav aria-label="صفحات السجلات" style={{ display: "flex", gap: 24, marginBlock: 16 }}>
          {page > 1 ? <Link href={operationUrl(org, entity, page - 1)}>الصفحة السابقة</Link> : null}
          {page * pageSize < total ? <Link href={operationUrl(org, entity, page + 1)}>الصفحة التالية</Link> : null}
        </nav>
      </>}
      {manager && !recordsResult.error ? <details><summary>إضافة سجل أو تعديله</summary>
        {referenceError ? <p role="alert">تعذر تحميل السجلات المرتبطة؛ أعد تحميل الصفحة قبل الحفظ.</p> : <>
          {entity === "enrollments" && childrenResult.options.length === 0 ? <p>أضف طفلًا من قسم الأطفال قبل إنشاء طلب التسجيل.</p> : <OperationForm key={`${org}:${entity}:${page}`} organizationId={org} entity={entity} records={records} branches={branchesResult.options} childrenOptions={childrenResult.options} guardians={guardiansResult.options} />}
          {entity === "enrollments" || entity === "invoices" ? <p>تعرض قوائم الربط أول ٥٠٠ سجل مرتبة بالاسم. تبقى الروابط الحالية محفوظة عند تعديل سجل مرتبط خارج هذه القائمة.</p> : null}
        </>}
      </details> : null}
    </section>
    {entity === "children" ? linksResult.error || referenceError ? <p role="alert" className="info-banner" style={{ marginTop: 24 }}>تعذر تحميل روابط أولياء الأمور. أعد تحميل الصفحة.</p>
      : <FamilyLinks key={org} organizationId={org} manager={manager} childrenOptions={childrenResult.options} guardians={guardiansResult.options} links={(linksResult.data ?? []) as FamilyLink[]} /> : null}
    {manager ? <>
      <section className="card" style={{ marginTop: 24 }}><details><summary>إعدادات المنشأة</summary><OrganizationForm key={org} organizationId={org} name={organization?.name ?? ""} type={organization?.type ?? "school"} /></details></section>
      <section className="card" style={{ marginTop: 24 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><h2>آخر العمليات</h2><Link href={`/dashboard/audit?org=${encodeURIComponent(org)}`}>سجل التدقيق كامل</Link></div>
        {auditResult.error ? <p role="alert">سجل التدقيق غير متاح. تواصل مع مسؤول المنصة.</p> : auditResult.data?.length ? <ul>{auditResult.data.map(event => <li key={event.id}>{entityLabels[event.entity as Entity] ?? auditLabels[event.entity] ?? "سجل"} — {event.action === "INSERT" ? "إضافة" : event.action === "UPDATE" ? "تعديل" : "حذف"} — {new Date(event.created_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</li>)}</ul> : <p>لا توجد عمليات مسجلة بعد.</p>}
      </section>
    </> : null}
  </>;
}
