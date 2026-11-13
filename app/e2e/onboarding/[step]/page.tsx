import { notFound } from "next/navigation";
import { OnboardingGuide } from "../../../../components/onboarding-guide";
import { isStepKey, type OnboardingStatus, type StepKey } from "../../../../lib/onboarding";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

const orgSteps: StepKey[] = ["profile", "device", "sections", "classes", "students", "guardians", "team", "attendance", "daily", "portal"];
const staffSteps: StepKey[] = ["profile", "device", "attendance", "daily", "my", "support"];
const markable = new Set<StepKey>(["device", "sections", "my", "support"]);

/**
 * Browser-test page for the guided setup: the real shell and guide, each step on its own page with
 * a stand-in of the button the real page has. The test answers the database calls. Only when SEER_E2E=1.
 */
export default async function OnboardingTestPage({ params, searchParams }: { params: Promise<{ step: string }>; searchParams: Promise<{ track?: string; done?: string; welcome?: string }> }) {
  if (process.env.SEER_E2E !== "1") notFound();
  const [{ step }, query] = await Promise.all([params, searchParams]);
  if (!isStepKey(step) && step !== "home") notFound();
  const track = query.track === "staff" ? "staff" : "org";
  const done = Number(query.done ?? 0);
  const steps = (track === "org" ? orgSteps : staffSteps).map((key, index) => ({ step: key, done: index < done, markable: track === "staff" ? key !== "profile" : markable.has(key) }));
  const initial: OnboardingStatus = { track, steps, done: Math.min(done, steps.length), total: steps.length, complete: done >= steps.length, started: query.welcome !== "1", snoozed_until: null, snooze_count: 0, show_welcome: query.welcome === "1" };
  return <>
    <OnboardingGuide organizationId="00000000-0000-0000-0000-0000000000e2" stage="kindergarten" initial={initial} pagePrefix="/e2e/onboarding" />
    <h1>صفحة {step}</h1>
    <p style={{ height: 500 }}>محتوى الصفحة.</p>
    {step === "profile" ? <section id="me-section" className="card"><label>اسمك<input /></label></section> : null}
    {step === "device" ? <section id="notify" className="card"><button type="button" className="btn btn-primary">تفعيل الإشعارات على هذا الجهاز</button></section> : null}
    {step === "sections" ? <section id="sections" className="card">الأقسام</section> : null}
    {step === "classes" ? <section className="card"><details><summary>إضافة صف</summary></details></section> : null}
    {step === "students" ? <section className="card"><details><summary>إضافة طالب جديد</summary></details></section> : null}
    <p style={{ height: 400 }} />
  </>;
}
