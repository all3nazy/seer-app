import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "../../components/app-shell";
import { requestSession } from "../../lib/supabase/server";
import { stageOf } from "../../lib/stage";
import Link from "next/link";
import { featureLabels, featureOf, featureState, renewalNotice, type MyOrg } from "../../lib/subscriptions";
import { onColor } from "../../lib/documents";

/**
 * The shell for every dashboard page: organizations, their subscription state, sections and brand
 * colours in one call. A locked organization goes to the renewal page (the database closes the
 * data anyway); the last days and the grace period show a banner.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { client, user } = await requestSession();
  const [{ data }, admin, head] = await Promise.all([
    user ? client.rpc("my_organizations") : Promise.resolve({ data: [] }),
    user ? client.rpc("am_platform_admin") : Promise.resolve({ data: false }),
    headers(),
  ]);
  const organizations = (data ?? []) as MyOrg[];
  const path = head.get("x-seer-path") ?? "";
  const requested = head.get("x-seer-org") ?? "";
  const current = organizations.find(org => org.organization_id === requested) ?? organizations[0] ?? null;
  if (current?.access === "locked" && !path.startsWith("/dashboard/billing")) {
    redirect(`/dashboard/billing?org=${encodeURIComponent(current.organization_id)}&locked=1`);
  }
  const notice = renewalNotice(current);
  // A page whose section is outside the plan, or turned off by the organization, is not shown.
  const feature = featureOf(path);
  const gate = current ? featureState(feature, { features: current.features ?? [], disabled: current.disabled_features ?? [] }) : "on";
  const brand = current?.primary_color ? { primary: current.primary_color, onPrimary: onColor(current.primary_color), accent: current.accent_color } : current?.accent_color ? { primary: null, onPrimary: null, accent: current.accent_color } : null;
  return <AppShell stage={stageOf(current?.type ?? organizations[0]?.type)} organizations={organizations.map(org => ({ id: org.organization_id, name: org.name }))}
    supportPhone={process.env.SEER_SUPPORT_WHATSAPP ?? ""} manager={organizations.some(org => org.role === "owner" || org.role === "admin")} userId={user?.id}
    sections={current ? { features: current.features ?? [], disabled: current.disabled_features ?? [] } : null} brand={brand}
    notice={notice ? { text: notice, owner: current?.role === "owner", org: current!.organization_id } : null} platformAdmin={admin.data === true}>
    {gate === "on" || !feature ? children : <section className="card" style={{ maxWidth: 560, display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>🔒 {featureLabels[feature]}</h1>
      {gate === "locked"
        ? <><p style={{ margin: 0 }}>هذا القسم ضمن الباقة المتقدمة. رقّ باقتك عند التجديد لتفعيله، وتبقى بياناتك كما هي.</p><span><Link className="btn btn-primary" href={`/dashboard/billing?upgrade=${feature}`}>رقّ باقتك</Link></span></>
        : <><p style={{ margin: 0 }}>هذا القسم مطفي في منشأتك. يقدر المالك يشغّله من الإعدادات.</p><span><Link className="btn" href="/dashboard/settings#sections">الإعدادات</Link></span></>}
    </section>}
  </AppShell>;
}
