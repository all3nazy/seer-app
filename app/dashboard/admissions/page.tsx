import Link from "next/link";
import { headers } from "next/headers";
import { loadOrgContext } from "../../../lib/org-context";
import { OrgSwitcher, OrgUnavailable } from "../../../components/org-unavailable";
import { AdmissionSettingsForm } from "../../../components/admission-forms";
import { Icon } from "../../../components/icons";
import { applicationStatuses, applicationStatusLabels, applicationStatusTone, isApplicationStatus, type ApplicationStatus } from "../../../lib/admissions";

export const dynamic = "force-dynamic";
export const metadata = { title: "القبول والتسجيل" };
const pageSize = 30;
type Row = { id: string; reference: string; child_name: string; guardian_name: string; grade_level_id: string | null; status: ApplicationStatus; interview_at: string | null; created_at: string };

export default async function AdmissionsPage({ searchParams }: { searchParams: Promise<{ org?: string; status?: string; page?: string }> }) {
  const params = await searchParams;
  const context = await loadOrgContext(params.org);
  if ("error" in context) return <OrgUnavailable reason={context.error} />;
  const { client, org, orgName, manager, organizations } = context;
  if (!manager) return <section className="card"><h1>القبول والتسجيل</h1><p>طلبات الالتحاق لمسؤول المنشأة فقط.</p></section>;
  const status = isApplicationStatus(params.status) ? params.status : undefined;
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 10000 ? requestedPage : 1;
  let query = client.from("applications").select("id,reference,child_name,guardian_name,grade_level_id,status,interview_at,created_at", { count: "exact" }).eq("organization_id", org);
  if (status) query = query.eq("status", status);
  const [list, settings, grades, statuses] = await Promise.all([
    query.order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1),
    client.from("admission_settings").select("is_open,intro,daily_limit").eq("organization_id", org).maybeSingle(),
    client.from("grade_levels").select("id,name").eq("organization_id", org).order("sort_order"),
    client.from("applications").select("status").eq("organization_id", org).limit(10000),
  ]);
  const counts = new Map<string, number>();
  for (const row of (statuses.data ?? []) as { status: string }[]) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  const gradeName = new Map(((grades.data ?? []) as { id: string; name: string }[]).map(grade => [grade.id, grade.name]));
  const rows = (list.data ?? []) as Row[];
  const total = list.count ?? 0;
  const head = await headers();
  const origin = `${head.get("x-forwarded-proto") ?? "https"}://${head.get("host") ?? "seer-app-psi.vercel.app"}`;
  const orgParam = encodeURIComponent(org);
  const url = (extra: Record<string, string>) => `/dashboard/admissions?${new URLSearchParams({ org, ...(status ? { status } : {}), ...extra })}`;
  return <>
    <header className="page-head">
      <div><h1>القبول والتسجيل</h1><p>طلبات الالتحاق في {orgName}، من التقديم إلى التسجيل.</p></div>
      <OrgSwitcher path="/dashboard/admissions" current={org} organizations={organizations} />
    </header>
    <section className="card" style={{ marginBottom: 24 }}>
      <details open={!settings.data}>
        <summary>التقديم الإلكتروني: {settings.data?.is_open ? <span className="chip-soft ok">مفتوح</span> : <span className="chip-soft">مغلق</span>}</summary>
        <div style={{ marginTop: 12 }}>
          {settings.error ? <p role="alert">تعذر تحميل الإعدادات.</p> : <AdmissionSettingsForm organizationId={org} isOpen={settings.data?.is_open ?? false} intro={settings.data?.intro ?? null} dailyLimit={settings.data?.daily_limit ?? 100} link={`${origin}/apply/${org}`} />}
        </div>
      </details>
    </section>
    <nav className="segments" aria-label="تصفية حسب الحالة">
      <Link href={`/dashboard/admissions?org=${orgParam}`} aria-current={!status ? "page" : undefined}>الكل ({(statuses.data?.length ?? 0).toLocaleString("ar-SA")})</Link>
      {applicationStatuses.filter(item => counts.get(item)).map(item => <Link key={item} href={`/dashboard/admissions?org=${orgParam}&status=${item}`} aria-current={item === status ? "page" : undefined}>{applicationStatusLabels[item]} ({(counts.get(item) ?? 0).toLocaleString("ar-SA")})</Link>)}
    </nav>
    {list.error ? <p role="alert" className="info-banner">تعذر تحميل الطلبات. أعد تحميل الصفحة.</p>
      : rows.length ? <div className="list">{rows.map(row => <Link key={row.id} className="list-row" href={`/dashboard/admissions/${row.id}?org=${orgParam}`}>
        <span className="tile-icon tone-sky"><Icon name="child" /></span>
        <span className="body"><span className="title">{row.child_name}</span>
          <span className="sub">{[row.guardian_name, row.grade_level_id ? gradeName.get(row.grade_level_id) : null, new Date(row.created_at).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" }), row.interview_at ? `مقابلة ${new Date(row.interview_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" })}` : null].filter(Boolean).join(" · ")}</span></span>
        <span className={`chip-soft ${applicationStatusTone[row.status]}`}>{applicationStatusLabels[row.status]}</span>
      </Link>)}</div>
      : <p className="empty">{status ? "ما فيه طلبات بهذه الحالة." : "ما وصلت طلبات بعد. افتح التقديم وشارك الرابط مع أولياء الأمور."}</p>}
    <nav aria-label="صفحات الطلبات" style={{ display: "flex", gap: 24, marginBlock: 16 }}>
      {page > 1 ? <Link href={url({ page: String(page - 1) })}>الصفحة السابقة</Link> : null}
      {page * pageSize < total ? <Link href={url({ page: String(page + 1) })}>الصفحة التالية</Link> : null}
    </nav>
  </>;
}
