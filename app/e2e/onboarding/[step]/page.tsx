import { notFound } from "next/navigation";
import { SettingsTabs } from "../../../../components/settings-tabs";
import { GuideButton } from "../../../../components/guide-button";
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
  if (!isStepKey(step) && step !== "home" && step !== "tour" && step !== "settings") notFound();
  // «tour»: a stand-in for the students page, for the page tour.
  if (step === "tour") return <div data-tour-as="/dashboard/children">
    <OnboardingGuide organizationId="00000000-0000-0000-0000-0000000000e2" stage="kindergarten" initial={null} pagePrefix="/e2e/onboarding" />
    <h1>الطلاب</h1>
    <form className="toolbar"><label>بحث<input name="q" /></label><button type="submit" className="btn">عرض</button></form>
    <div className="list"><a className="list-row" href="#a">طالب تجريبي</a></div>
    <section className="card"><details><summary>إضافة طالب جديد</summary></details></section>
    <p><a className="btn" href="#excel">استيراد من Excel</a></p>
  </div>;
  const track = query.track === "staff" ? "staff" : "org";
  const done = Number(query.done ?? 0);
  const steps = (track === "org" ? orgSteps : staffSteps).map((key, index) => ({ step: key, done: index < done, markable: track === "staff" ? key !== "profile" : markable.has(key) }));
  const initial: OnboardingStatus = { track, steps, done: Math.min(done, steps.length), total: steps.length, complete: done >= steps.length, started: query.welcome !== "1", snoozed_until: null, snooze_count: 0, show_welcome: query.welcome === "1" };
  return <>
    <OnboardingGuide organizationId="00000000-0000-0000-0000-0000000000e2" stage="kindergarten" initial={initial} pagePrefix="/e2e/onboarding" />
    <h1>صفحة {step}</h1>
    <p style={{ height: 500 }}>محتوى الصفحة.</p>
    {/* The settings steps share one page with the real tabs, as /dashboard/settings does. */}
    {step === "settings" ? <SettingsTabs tabs={[
      { id: "account", label: "حسابي", content: <section id="me-section" className="card" style={{ maxWidth: 640 }}><label>اسمك<input /></label><label>جوالك<input /></label></section> },
      { id: "organization", label: "المنشأة", content: <section id="sections" className="card" style={{ maxWidth: 640, display: "grid", gap: 8 }}>{Array.from({ length: 14 }, (_, index) => <label key={index}><input type="checkbox" defaultChecked /> قسم رقم {index + 1}</label>)}</section> },
      { id: "device", label: "الجهاز والإشعارات", content: <section id="notify" className="card" style={{ maxWidth: 640 }}><button type="button" className="btn btn-primary">تفعيل الإشعارات على هذا الجهاز</button></section> },
      { id: "help", label: "المساعدة", content: <section className="card" style={{ maxWidth: 640 }}><GuideButton /></section> },
    ]} /> : null}
    {step === "classes" ? <section className="card"><details><summary>إضافة صف</summary></details></section> : null}
    {step === "students" ? <section className="card"><details><summary>إضافة طالب جديد</summary></details></section> : null}
    {step === "guardians" ? <section className="card" data-tour="guardians"><h2>أولياء الأمور</h2><p>ولي أمر ١</p></section> : null}
    {step === "team" ? <section className="card"><button type="button" className="btn-primary">إنشاء رابط انضمام</button></section> : null}
    {step === "attendance" ? <form className="card"><button type="button" className="btn btn-sm">تحديد الباقين حاضرين</button></form> : null}
    {/* Taller than the screen: the bubble is pinned to the bottom. */}
    {step === "daily" ? <form className="card" style={{ minHeight: 1300 }}><label>الطفل<select><option>طفل</option></select></label></form> : null}
    {step === "portal" ? <section className="card"><button type="button" className="btn btn-sm">رابط البوابة</button></section> : null}
    <p style={{ height: 400 }} />
  </>;
}
