import { normalizeArabic } from "./assistant-intents";
import type { BotPersona } from "./stage";

/**
 * The bot's social side: reading the tone of a message, answering courtesy and small talk warmly,
 * and turning the day's numbers into a calm, prioritised briefing. Everything runs in the app;
 * nothing is sent to an outside service.
 */
export type Mood = "frustrated" | "urgent" | "worried" | "thanks" | "praise" | "apology" | "neutral";

const n = (value: number) => value.toLocaleString("ar-SA");
const clean = (value: string) => normalizeArabic(value).replace(/ئ/g, "ي").replace(/ؤ/g, "و").replace(/[؟?!.,،؛:«»"…]/g, " ").replace(/\s+/g, " ").trim();

export function detectMood(text: string): Mood {
  const q = clean(text);
  if (/ما يشتغل|ما اشتغل|خربان|خربت|عطلان|معطل|زهقت|طفشت|تعبت|مليت|سيء|سييء|مستفز|ازعاج|مزعج|ما ينفع|فاشل|غبي|ليش ما|ليه ما|كل مره|للمره|مو راضي|ما زبط|ما ضبط|مشكله كبيره|يا اخي|ياخي/.test(q) || /!{2,}/.test(text)) return "frustrated";
  if (/ضروري|عاجل|بسرعه|الحين الحين|طارئ|طوارئ|مستعجل|حالا|فورا/.test(q)) return "urgent";
  if (/خايف|خايفه|قلقان|قلقانه|قلق|متوتر|متوتره|مضغوط|مضغوطه|ضغط شغل/.test(q)) return "worried";
  if (/^(?:اسف|اسفه|معليش|المعذره|عفوا|سامحني)/.test(q)) return "apology";
  if (/شكرا|مشكور|مشكوره|يعطيك العافيه|الله يعافيك|تسلم|تسلمين|جزاك الله|ثانكس|thanks/.test(q)) return "thanks";
  if (/ممتاز|رهيب|كفو|احسنت|ابدعت|حلو|جميل|يا سلام|شاطر|شاطره|الله عليك/.test(q)) return "praise";
  return "neutral";
}

/** A short line acknowledging how the person feels, placed before the actual answer. */
export function empathyLead(mood: Mood): string {
  switch (mood) {
    case "frustrated": return "أفهم إن الموقف مزعج، ومعك حق. خلّنا نحلها خطوة خطوة.";
    case "urgent": return "أبشر، أتعامل معها الحين.";
    case "worried": return "لا تشيل هم، نرتّبها سوا.";
    default: return "";
  }
}

const courtesy = /^(?:(?:السلام عليكم|سلام عليكم|السلام|سلام|مرحبا|مرحبتين|هلا والله|هلا|اهلين|اهلا|هاي|صباح الخير|صباح النور|مساء الخير|مساء النور|لو سمحت|لو سمحتي|من فضلك|يا|ممكن|الله يعافيك|الله يسعدك|بليز|اذا ممكن|ورحمه الله|وبركاته)\s*)+/;
/** Removes greetings and politeness at the start so «السلام عليكم، مين غايب؟» still runs the command. */
export function stripCourtesy(text: string): string {
  const q = clean(text);
  const rest = q.replace(courtesy, "").replace(/^(?:يا\s*)?(?:قمره|ارنوب|نجيب)\s*/, "").trim();
  return rest;
}

export function dayGreeting(hour: number): string {
  if (hour >= 4 && hour < 12) return "صباح الخير";
  if (hour >= 12 && hour < 17) return "يسعد ظهرك";
  return "مساء الخير";
}

/**
 * Replies to messages that are only social: greetings, thanks, praise, apologies, "who are you",
 * "how are you", goodbyes. Returns null when the message asks for something.
 */
export function smallTalk(text: string, persona: BotPersona, hour: number): string | null {
  const q = clean(text);
  if (!q) return null;
  if (/^(?:السلام عليكم|سلام عليكم|السلام)(?: ورحمه الله)?(?: وبركاته)?$/.test(q)) return `وعليكم السلام ورحمة الله وبركاته، ${dayGreeting(hour)}! أنا ${persona.name}، وش أقدر أخدمك فيه اليوم؟`;
  if (/^(?:صباح الخير|صباح النور|صباحو)$/.test(q)) return `صباح النور والسرور! جاهز${persona.name === "قمرة" ? "ة" : ""} معك. تبي ملخص اليوم؟ قل «ملخص اليوم».`;
  if (/^(?:مساء الخير|مساء النور)$/.test(q)) return "مساء النور! كيف كان يومك؟ إذا تبي أراجع معك وش باقي، قل «ملخص اليوم».";
  if (/^(?:مرحبا|مرحبتين|هلا|هلا والله|اهلين|اهلا|هاي|هلو)$/.test(q)) return `هلا والله وغلا! ${dayGreeting(hour)}. أنا ${persona.name}، تحت أمرك.`;
  if (/^(?:كيفك|كيف حالك|كيف الحال|شلونك|علومك|وش اخبارك|كيف الامور|عساك بخير)/.test(q)) return "الحمد لله بخير، وأتمنى إنك بخير وعافية. يومك كيف ماشي؟ أنا هنا إذا احتجت شيء.";
  if (/^(?:مين انت|من انت|وش انت|ايش انت|عرف بنفسك|وش اسمك|ايش اسمك|مين حضرتك)/.test(q)) return `أنا ${persona.name}، ${persona.title} داخل سِير. أشتغل داخل المنصة فقط وما أرسل بياناتكم لأي جهة خارجية. أشوف بنفس صلاحيتك بالضبط، وأي تغيير أعرضه عليك قبل التنفيذ ويتسجّل باسمك.`;
  if (/^(?:انت ذكاء اصطناعي|هل انت ذكاء|انت روبوت|انت بوت)/.test(q)) return `أنا ${persona.name}، مساعد داخلي مبني على قواعد واضحة وبيانات منشأتك فقط، بدون ذكاء اصطناعي خارجي. لذلك إجاباتي ثابتة ومضمونة، وإذا ما فهمت أقول لك بصراحة.`;
  const mood = detectMood(q);
  const onlySocial = q.split(" ").length <= 6;
  if (mood === "thanks" && onlySocial) return "العفو، هذا واجبي! وإذا احتجت أي شيء ثاني أنا موجود.";
  if (mood === "praise" && onlySocial) return "تسلم، كلامك يفرحني! نكمّل؟";
  if (mood === "apology" && onlySocial) return "ولا يهمك أبدًا، خذ راحتك. وش تحتاج؟";
  if (/^(?:مع السلامه|باي|الى اللقاء|يلا باي|تصبح على خير|تصبحين على خير|في امان الله)$/.test(q)) return "في أمان الله! يومك سعيد، وأنا هنا متى ما احتجتني.";
  if (/^(?:تمام|اوكي|اوك|طيب|زين|حلو|ok|okay)$/.test(q)) return "تمام 👍";
  return null;
}

export type Briefing = {
  manager: boolean;
  attendance: { present: number; late: number; absent: number; excused: number; pending: number; total: number } | null;
  tasks: { overdue: number; dueToday: number; mine: number } | null;
  applications: number | null;
  leave: number | null;
  inquiries: number | null;
  invoices: { overdue: number; overdueAmount: number } | null;
  messages: { queued: number; failed: number } | null;
  dailyReports: { written: number } | null;
  trips: { running: number; done: number } | null;
  unassigned?: number | null;
  notices?: number | null;
};
export type BriefItem = { text: string; tone: "alert" | "warn" | "ok"; href: string; label: string };

/**
 * Turns the day's numbers into a short, prioritised briefing: what needs attention first, then
 * what is fine. Missing parts (no permission or no data) are simply left out.
 */
export function briefingItems(b: Briefing): BriefItem[] {
  const items: BriefItem[] = [];
  const a = b.attendance;
  if (a && a.total) {
    if (a.pending) items.push({ tone: "warn", href: "/dashboard/attendance", label: "الحضور", text: `${n(a.pending)} ما تسجّل حضورهم بعد من ${n(a.total)}.` });
    if (a.absent || a.late) items.push({ tone: a.absent > Math.max(3, a.total * 0.15) ? "alert" : "warn", href: "/dashboard/classes", label: "الفصول", text: `${n(a.absent)} غائب و${n(a.late)} متأخر اليوم.` });
    if (!a.pending && !a.absent && !a.late) items.push({ tone: "ok", href: "/dashboard/classes", label: "الفصول", text: `الحضور مكتمل: ${n(a.present + a.excused)} من ${n(a.total)} 👏` });
  }
  if (b.tasks) {
    if (b.tasks.overdue) items.push({ tone: "alert", href: "/dashboard/tasks", label: "المهام", text: `${n(b.tasks.overdue)} مهمة متأخرة عن موعدها.` });
    if (b.tasks.dueToday) items.push({ tone: "warn", href: "/dashboard/tasks", label: "المهام", text: `${n(b.tasks.dueToday)} مهمة موعدها اليوم.` });
    if (b.tasks.mine) items.push({ tone: "warn", href: "/dashboard/my", label: "مهامي", text: `${n(b.tasks.mine)} مهمة مسندة لك ومفتوحة.` });
  }
  if (b.leave) items.push({ tone: "warn", href: "/dashboard/staff", label: "الموظفين", text: `${n(b.leave)} طلب إجازة ينتظر قرارك.` });
  if (b.applications) items.push({ tone: "warn", href: "/dashboard/admissions", label: "القبول", text: `${n(b.applications)} طلب التحاق جديد أو قيد المراجعة.` });
  if (b.inquiries) items.push({ tone: "warn", href: "/dashboard/inquiries", label: "الاستفسارات", text: `${n(b.inquiries)} استفسار من الموظفين بانتظار الرد.` });
  if (b.invoices?.overdue) items.push({ tone: "alert", href: "/dashboard/finance", label: "المالية", text: `${n(b.invoices.overdue)} فاتورة تجاوزت موعدها، المتبقي ${b.invoices.overdueAmount.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س.` });
  if (b.messages?.failed) items.push({ tone: "alert", href: "/dashboard/messages", label: "الرسائل", text: `${n(b.messages.failed)} رسالة تعذّر إرسالها، تحتاج مراجعة.` });
  if (b.messages?.queued) items.push({ tone: "warn", href: "/dashboard/messages", label: "الرسائل", text: `${n(b.messages.queued)} رسالة بانتظار الإرسال.` });
  if (b.notices) items.push({ tone: "warn", href: "/dashboard/attendance", label: "الحضور", text: `${n(b.notices)} إشعار غياب من أولياء الأمور لليوم.` });
  if (b.unassigned) items.push({ tone: "warn", href: "/dashboard/children?section=none", label: "الطلاب", text: `${n(b.unassigned)} طالب بدون فصل؛ ما يظهرون في الحضور اليومي والدرجات.` });
  if (b.trips?.running) items.push({ tone: "warn", href: "/dashboard/transport", label: "النقل", text: `${n(b.trips.running)} رحلة باص جارية الآن.` });
  if (b.dailyReports && a && b.dailyReports.written < a.present + a.late)
    items.push({ tone: "warn", href: "/dashboard/daily", label: "التقرير اليومي", text: `التقارير اليومية: ${n(b.dailyReports.written)} من ${n(a.present + a.late)} طفل حاضر.` });
  const rank = { alert: 0, warn: 1, ok: 2 } as const;
  return items.sort((x, y) => rank[x.tone] - rank[y.tone]);
}

/** Adds the organization to a briefing link, whether or not it already has a query. */
export function withOrg(href: string, org: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}org=${encodeURIComponent(org)}`;
}
export function briefingText(items: BriefItem[], hour: number): string {
  const alerts = items.filter(item => item.tone === "alert").length;
  const open = items.filter(item => item.tone !== "ok").length;
  const lead = `${dayGreeting(hour)}! هذا ملخصك الآن:`;
  if (!open) return `${dayGreeting(hour)}! كل شيء تحت السيطرة اليوم، ما فيه شي ينتظرك. يعطيك العافية 🌿`;
  const close = alerts
    ? `أقترح نبدأ بـ«${items[0].label}» لأنها الأهم. وإذا تبيني أساعد في شيء محدد قل لي.`
    : "ما فيه شي حرج، بس هذي أمور تستاهل نظرة لما يتيسر لك.";
  return `${lead}\n${close}`;
}

/** Friendly fallback when nothing matched: never a dead end. */
export function notUnderstood(text: string, persona: BotPersona): string {
  const mood = detectMood(text);
  const lead = mood === "frustrated" ? "آسف إني ما فهمتك من أول مرة، ما أبي أضيّع وقتك." : "اعذرني، ما قدرت أفهم الطلب بالضبط.";
  return `${lead} جرّب تكتبها بطريقة ثانية، مثل: «مين غايب اليوم؟»، «سجّل ريم متأخرة»، «ملخص اليوم»، أو «كيف أضيف موظف؟». وإذا تفضّل، أحوّلك للدعم وأنا ما نفذت أي إجراء. — ${persona.name}`;
}
