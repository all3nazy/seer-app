import type { Stage } from "./stage";
import { normalizeArabic } from "./assistant-intents";
import { guide as knowledge } from "./bot-knowledge";
import { navLinks } from "./navigation";

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

// Starting the guide from elsewhere (the assistant, the settings) --------------------------------------
/** «setup»: the setup from its first missing step, or a replay once complete; «page»: a tour of the page open now. */
export type GuideRequest = { mode: "setup" } | { mode: "page" };
export const GUIDE_EVENT = "seer:guide";
export function requestGuide(request: GuideRequest): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<GuideRequest>(GUIDE_EVENT, { detail: request }));
}

const tidy = (value: string) => normalizeArabic(value).replace(/[ئ]/g, "ي").replace(/[؟?!.,،؛:«»"()]/g, " ").replace(/\s+/g, " ").trim()
  .replace(/^(?:لو سمحت|من فضلك|ممكن|ابي|ابغي|ودي|بغيت|تكفي|تكفى|يا \S+)\s+/g, "").replace(/\s+(?:لو سمحت|من فضلك|تكفي|تكفى|الله يعافيك|بليز)$/g, "").trim();
const pageWords = /^(?:اشرح(?: لي| ل)?|اشرحلي|تشرح(?: لي)?|شرح|علمني|عرفني(?: على)?|جوله(?: في)?|خذني جوله(?: في)?|سو(?:ي)? لي جوله(?: في)?|وش|ايش|وش فايده|ايش فايده)\s*(?:هالصفحه|هذي الصفحه|هذه الصفحه|الصفحه هذي|الصفحه الحاليه|الصفحه|ذي الصفحه|هالشاشه|هذي الشاشه|الشاشه)(?: هذي)?$/;
const setupWords = /^(?:اشرح(?: لي)?|اشرحلي|اشرح لي المنصه|اشرح المنصه|ابدا الشرح|ابدي الشرح|شغل(?: لي)? الشرح|شغل الجوله|الشرح|الجوله|جوله|خذني جوله|سو(?:ي)? لي جوله|كيف ابدا|كيف ابدي|كيف نبدا|من وين ابدا|من وين نبدا|وش اسوي اول|ايش اسوي اول|علمني|عملني|علمني المنصه|علمني على المنصه|وش الخطوه الجايه|ايش الخطوه الجايه|وش الخطوه التاليه|ايش الخطوه التاليه|الخطوه الجايه|الخطوه التاليه|وش باقي|وش باقي علي|كمل التجهيز|كمل تجهيز \S+|التجهيز|تجهيز \S+|وين وصلت(?: في التجهيز)?|ساعدني ابدا|(?:كيف|وين) (?:اشغل|اشوف|القى|الاقي) الشرح)$/;

/** The assistant's guide requests: «اشرح لي هالصفحة» → page; «ابدأ الشرح», «كيف أبدأ», «وش الخطوة الجاية» → setup. */
export function guideRequest(text: string): GuideRequest["mode"] | null {
  const q = tidy(text);
  if (!q) return null;
  if (pageWords.test(q)) return "page";
  if (setupWords.test(q)) return "setup";
  return null;
}

/** The first suggestion in the assistant while the setup is not complete. */
export function setupSuggestion(status: Pick<OnboardingStatus, "track" | "done" | "total" | "complete">, stage: Stage): string | null {
  if (status.complete || !status.total) return null;
  const counts = `(${toArabicDigits(status.done)} من ${toArabicDigits(status.total)})`;
  return status.track === "org" ? `كمّل ${barLabel("org", stage)} ${counts}` : `كمّل جولتك ${counts}`;
}
const toArabicDigits = (value: number) => String(value).replace(/[0-9]/g, digit => String.fromCharCode(0x0660 + Number(digit)));

// Page tours ---------------------------------------------------------------------------------------
export type TourStop = { targets: Target[]; title: string; text: string };
export type PageTour = { title: string; stops: TourStop[] };

/** The first sentences of a text, up to about `max` characters. */
function short(text: string, max = 200): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("،"));
  return `${cut.slice(0, end > 60 ? end : max).trim()}…`;
}

/** Stops for the main pages; the others get the general tour (title, main button, filters, list). */
const tourStops: Record<string, TourStop[]> = {
  "/dashboard/attendance": [
    { targets: [{ selector: "main form" }], title: "اختر الفصل واليوم", text: "اختر الفرع والفصل والتاريخ، وتطلع لك قائمة طلابه." },
    { targets: [{ selector: "button", text: "تحديد الباقين حاضرين" }], title: "تحديد الباقين حاضرين", text: "سجّل المتأخر والغائب أول، وبعدها هالزر يحط الباقين حاضرين بضغطة." },
  ],
  "/dashboard/children": [
    { targets: [{ selector: "main form" }], title: "البحث والتصفية", text: "ابحث بالاسم أو صفّ حسب الفرع والشعبة والحالة." },
    { targets: [{ selector: "main .list .list-row" }], title: "ملف الطالب", text: "اضغط على أي طالب يفتح ملفه: بياناته وأولياء أمره والمصرّح لهم ورابط البوابة." },
    { targets: [{ selector: "summary", text: "إضافة طالب جديد" }], title: "إضافة طالب", text: "من هنا تضيف طالب جديد بياناته كاملة." },
    { targets: [{ selector: "a", text: "استيراد من Excel" }], title: "استيراد من Excel", text: "إذا عندك قائمة جاهزة، ارفعها أو الصقها وراجع الصفوف قبل الحفظ." },
  ],
  "/dashboard/team": [
    { targets: [{ selector: "button", text: "إنشاء رابط" }], title: "رابط انضمام", text: "أنشئ رابط وأرسله للموظف على الواتساب، ويدخل بدون إيميل." },
    { targets: [{ selector: "main .list" }, { selector: "main .records" }], title: "أعضاء الفريق", text: "هنا كل الأعضاء: تقدر تغيّر الدور أو تعيّن كلمة مرور جديدة أو تزيل العضو." },
  ],
  "/dashboard/settings": [
    { targets: [{ selector: "[role='tablist']" }], title: "التبويبات", text: "«حسابي» لاسمك وجوالك وكلمة المرور، و«المنشأة» للأقسام والهوية، و«الجهاز والإشعارات»، و«المساعدة»." },
    { targets: [{ selector: "#me-section" }], title: "اسمك في المنشأة", text: "الاسم اللي يشوفه فريقك وعلى المهام المسندة لك." },
  ],
};

/** A short tour of a main menu page (the pages listed in the sidebar), or null for other pages. */
export function pageTour(path: string): PageTour | null {
  const link = navLinks.find(item => item.href === path);
  if (!link) return null;
  const entry = knowledge.find(item => item.id !== "portal" && item.href === path);
  const intro: TourStop = { targets: [{ selector: "main h1" }], title: link.label, text: short(entry?.answer ?? `هذي صفحة «${link.label}».`) };
  const stops = tourStops[path] ?? [
    { targets: [{ selector: "main .page-head .btn" }, { selector: "main .page-head a" }, { selector: "main summary" }, { selector: "main .btn-primary" }], title: "الزر الأساسي", text: entry?.steps?.[1] ?? "من هنا تبدأ الشغل الأساسي في الصفحة." },
    { targets: [{ selector: "main form" }], title: "البحث والاختيار", text: "اختر أو اكتب هنا، وتتغيّر النتائج تحت." },
    { targets: [{ selector: "main .list" }, { selector: "main table" }, { selector: "main .records" }], title: "القائمة", text: "هنا تلقى السجلات، واضغط أي واحد يفتح تفاصيله." },
  ];
  return { title: link.label, stops: [intro, ...stops] };
}

/** The page a tour is for. Browser-test pages stand in for a menu page with data-tour-as. */
export function tourPathFor(path: string): string {
  if (typeof document === "undefined" || !path.startsWith("/e2e/")) return path;
  return document.querySelector("[data-tour-as]")?.getAttribute("data-tour-as") ?? path;
}

// Where the bubble goes ------------------------------------------------------------------------------
export type Rect = { top: number; left: number; width: number; height: number };
export type BubblePlacement = { side: "right" | "left" | "below" | "above" | "dock"; top?: number; left?: number; width?: number; ring: Rect | null };
const MARGIN = 12, GAP = 14, SIDE_WIDTH = 340;
export const PHONE_WIDTH = 700;

/**
 * Places the explanation bubble so it never covers the highlighted element (`target`, already
 * padded): beside it on the side with more room, otherwise below or above it, otherwise (an element
 * taller than the screen, or any phone) as a card pinned to the bottom (`dockTop` is the card's top
 * edge). The returned ring is the highlight, cut to what is visible above a pinned card.
 */
export function placeBubble(target: Rect, bubble: { height: number }, viewport: { width: number; height: number }, dockTop: number): BubblePlacement {
  const right = viewport.width - (target.left + target.width) - GAP - MARGIN;
  const left = target.left - GAP - MARGIN;
  const width = Math.min(SIDE_WIDTH, viewport.width - 2 * MARGIN);
  const clampTop = (value: number) => Math.min(Math.max(MARGIN, value), viewport.height - bubble.height - MARGIN);
  const visible = clip(target, 0, viewport.height);
  if (viewport.width >= PHONE_WIDTH && bubble.height + 2 * MARGIN <= viewport.height) {
    if (Math.max(left, right) >= width) {
      const side = right >= left ? "right" : "left";
      return { side, width, left: side === "right" ? target.left + target.width + GAP : target.left - GAP - width, top: clampTop(target.top + target.height / 2 - bubble.height / 2), ring: visible };
    }
    const centred = Math.min(Math.max(MARGIN, target.left + target.width / 2 - width / 2), viewport.width - width - MARGIN);
    const below = viewport.height - (target.top + target.height) - GAP - MARGIN;
    const above = target.top - GAP - MARGIN;
    if (below >= bubble.height && below >= above) return { side: "below", width, left: centred, top: target.top + target.height + GAP, ring: visible };
    if (above >= bubble.height) return { side: "above", width, left: centred, top: target.top - GAP - bubble.height, ring: visible };
    if (below >= bubble.height) return { side: "below", width, left: centred, top: target.top + target.height + GAP, ring: visible };
  }
  return { side: "dock", ring: clip(target, 0, dockTop - GAP) };
}

/** The part of a rectangle between two heights, or null when too little of it is left. */
function clip(rect: Rect, top: number, bottom: number): Rect | null {
  const from = Math.max(rect.top, top), to = Math.min(rect.top + rect.height, bottom);
  return to - from >= 16 ? { top: from, left: rect.left, width: rect.width, height: to - from } : null;
}
