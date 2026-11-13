import type { Stage } from "./stage";

/**
 * Guided setup. The database decides which steps a member has and which are done
 * (public.onboarding_status); this file says where each step happens, what to highlight there and
 * the short explanation in the bubble.
 */
export type StepKey = "profile" | "device" | "sections" | "classes" | "students" | "guardians" | "team" | "attendance" | "daily" | "portal" | "my" | "support";
export type Track = "org" | "staff";
export type StepState = { step: StepKey; done: boolean; markable: boolean };
export type OnboardingStatus = { track: Track; steps: StepState[]; done: number; total: number; complete: boolean; started: boolean; snoozed_until: string | null; snooze_count: number; show_welcome: boolean };

/** Where to point: the first visible match (a CSS selector, optionally with the element's text). */
export type Target = { selector: string; text?: string };
export type StepGuide = {
  title: string;
  /** The page of the step; `pages` are other pages where it can be done too (e.g. a student's file). */
  path: string; pages?: string[];
  targets: Target[];
  text: string;
  /** For a step the member marks: the button in the bubble. */
  mark?: string;
};

const settingsAccount = "/dashboard/settings#account";
export const stepGuides: Record<StepKey, StepGuide> = {
  profile: { title: "اسمك وجوالك", path: settingsAccount, targets: [{ selector: "#me-section" }],
    text: "اكتب اسمك اللي يشوفه فريقك واحفظه، وتحته جوالك عشان توصلك المهام على الواتساب." },
  device: { title: "تثبيت التطبيق والإشعارات", path: "/dashboard/settings#device", targets: [{ selector: "button", text: "تفعيل الإشعارات على هذا الجهاز" }, { selector: "#notify" }],
    text: "فعّل الإشعارات عشان توصلك التنبيهات أول بأول. وعلى الجوال ثبّت سِير على الشاشة الرئيسية من «سِير على جهازك».", mark: "ثبّته وفعّلته ✓" },
  sections: { title: "ترتيب الأقسام والهوية", path: "/dashboard/settings#organization", targets: [{ selector: "#sections" }],
    text: "شغّل الأقسام اللي تحتاجونها وطفِّ الباقي، واختر ألوان هويتكم. إذا خلصت اضغط «تم».", mark: "تم ✓" },
  classes: { title: "الفصول", path: "/dashboard/academics", targets: [{ selector: "summary", text: "إضافة صف" }, { selector: "summary", text: "إضافة شعبة" }],
    text: "أضف الصفوف أول (مثل «الروضة الأولى»)، وبعدها «إضافة شعبة» داخل كل صف." },
  students: { title: "الطلاب", path: "/dashboard/children", targets: [{ selector: "summary", text: "إضافة طالب جديد" }, { selector: "a", text: "استيراد من Excel" }],
    text: "أضف الطالب من هنا، وإذا عندك قائمة جاهزة استخدم «استيراد من Excel» وتنحفظ كلها مرة وحدة." },
  guardians: { title: "أولياء الأمور والمصرّح لهم", path: "/dashboard/children", pages: ["/dashboard/children/"], targets: [{ selector: "[data-tour='guardians']" }, { selector: "main .list .list-row" }],
    text: "افتح ملف طالب، واربط ولي أمره، وأضف المصرّح لهم بالاستلام. ما يقدر أحد غيرهم يستلم الطالب." },
  team: { title: "دعوة الفريق", path: "/dashboard/team", targets: [{ selector: "button", text: "إنشاء رابط" }],
    text: "أنشئ رابط انضمام وأرسله لموظفينك على الواتساب. يختارون اسم مستخدم وكلمة مرور ويدخلون بدون إيميل." },
  attendance: { title: "أول تسجيل حضور", path: "/dashboard/attendance", targets: [{ selector: "button", text: "تحديد الباقين حاضرين" }, { selector: "main form" }],
    text: "اختر الفصل وسجّل حالة كل طالب: حاضر أو متأخر أو غائب، أو اضغط «تحديد الباقين حاضرين»." },
  daily: { title: "أول تقرير يومي", path: "/dashboard/daily", targets: [{ selector: "main form" }],
    text: "اختر الطفل وعبّ يومه: المزاج والأكل والنوم والأنشطة، واحفظ. ويشوفه أهله في بوابتهم." },
  portal: { title: "روابط البوابة للأهالي", path: "/dashboard/children", pages: ["/dashboard/children/"], targets: [{ selector: "button", text: "رابط البوابة" }, { selector: "main .list .list-row" }],
    text: "افتح ملف طالب، وعند ولي الأمر اضغط «رابط البوابة» وأرسله له. يشوف فيه الحضور والتقارير بدون كلمة مرور." },
  my: { title: "مهامي", path: "/dashboard/my", targets: [{ selector: "main h1" }],
    text: "هنا مهامك وطلباتك، وتسجّل منها حضورك وانصرافك وتطلب إجازة.", mark: "فهمت ✓" },
  support: { title: "الدعم", path: "/dashboard/support", targets: [{ selector: "main h1" }],
    text: "إذا علقت في شي، من «الدعم» تكلّم فريق سِير مباشرة ويرد عليك داخل المنصة.", mark: "فهمت ✓" },
};

/** Staff see their part of attendance and the daily report, and mark them once they have seen them. */
export const staffTexts: Partial<Record<StepKey, { text: string; mark: string }>> = {
  attendance: { text: "كل صباح تسجّل هنا حضور فصلك: حاضر أو متأخر أو غائب، أو «تحديد الباقين حاضرين».", mark: "فهمت ✓" },
  daily: { text: "هنا تكتب يوم الطفل لأهله: المزاج والأكل والنوم والأنشطة.", mark: "فهمت ✓" },
};

export function guideFor(step: StepKey, track: Track): StepGuide {
  const base = stepGuides[step];
  const staff = track === "staff" ? staffTexts[step] : undefined;
  return staff ? { ...base, ...staff } : base;
}

const placeNames: Record<Stage, string> = { school: "مدرستكم", nursery: "حضانتكم", kindergarten: "روضتكم" };
const placeName: Record<Stage, string> = { school: "مدرستك", nursery: "حضانتك", kindergarten: "روضتك" };
export function welcomeTitle(track: Track, stage: Stage): string {
  return track === "org" ? `خلونا نجهّز ${placeNames[stage]}` : "هلا فيك في سِير! جولة سريعة";
}
export function barLabel(track: Track, stage: Stage): string {
  return track === "org" ? `تجهيز ${placeName[stage]}` : "جولتك في سِير";
}

/** The step to work on: the first one not done. */
export function currentStep(status: Pick<OnboardingStatus, "steps"> | null): StepState | null {
  return status?.steps.find(step => !step.done) ?? null;
}

/** Whether the page open now is where the step happens. */
export function onStepPage(step: StepKey, path: string): boolean {
  const guide = stepGuides[step];
  const page = guide.path.split("#")[0];
  return path === page || (guide.pages ?? []).some(prefix => path.startsWith(prefix));
}

/** The support ticket for «مساعدة في هالخطوة». */
export function stepHelpLink(step: StepKey): string {
  return `/dashboard/support/new?from=${encodeURIComponent(stepGuides[step].path.split("#")[0])}&step=${step}`;
}
export function isStepKey(value: unknown): value is StepKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(stepGuides, value);
}
export function helpSubject(step: StepKey): string { return `مساعدة في خطوة: ${stepGuides[step].title}`; }
export function helpBody(step: StepKey): string { return `أحتاج مساعدة في خطوة «${stepGuides[step].title}» من التجهيز. `; }

/** One organization's setup in the admin console (public.admin_onboarding, the owner's track). */
export type SetupRow = { organization_id: string; done: number; total: number; missing: string[]; snooze_count: number; stuck: boolean; completed_at: string | null };
export function setupPercent(row: Pick<SetupRow, "done" | "total">): number {
  return row.total ? Math.round((row.done / row.total) * 100) : 0;
}
export function stepTitle(step: string): string { return isStepKey(step) ? stepGuides[step].title : step; }
