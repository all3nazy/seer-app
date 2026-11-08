import { normalizeArabic } from "./assistant-intents";
import type { AttendanceStatus } from "./students";

/**
 * Commands the bot can carry out. Parsing only proposes an action; nothing runs until the person
 * confirms it in the chat, and the database re-checks permissions and logs every change.
 */
export type BotCommand =
  | { kind: "attendance"; name: string; status: AttendanceStatus }
  | { kind: "find"; name: string }
  | { kind: "pickup"; name: string }
  | { kind: "task"; title: string; due: "today" | "tomorrow" | null }
  | { kind: "today"; status: AttendanceStatus | "pending" | null }
  | { kind: "openClass"; name: string | null }
  | { kind: "tip" };

const norm = (value: string) => normalizeArabic(value).replace(/ئ/g, "ي").replace(/ؤ/g, "و").replace(/[؟?!.,،؛:«»"]/g, " ").replace(/\s+/g, " ").trim();

const statusWords: [RegExp, AttendanceStatus][] = [
  [/^(?:حاضر|حاضره|حضر|حضرت|وصل|وصلت|موجود|موجوده)$/, "present"],
  [/^(?:متاخر|متاخره|تاخر|تاخرت|متاخرين)$/, "late"],
  [/^(?:غايب|غايبه|غاب|غابت|غياب|الغياب|الغايبين|غايبين)$/, "absent"],
  [/^(?:بعذر|مستاذن|مستاذنه|معذور|معذوره|استاذن|استاذنت)$/, "excused"],
];
const filler = /^(?:سجل|سجلي|سجليه|سجله|حط|حطي|خل|خلي|اليوم|ان|انه|انها|الطالب|الطالبه|الطفل|الطفله|حضور|حاله|كـ?|ك|يا|لو|سمحت|ترى|تري|عن|ب)$/;
const statusOf = (word: string) => statusWords.find(([pattern]) => pattern.test(word))?.[1];

export function parseCommand(input: string): BotCommand | null {
  const q = norm(input);
  if (!q) return null;
  const words = q.split(" ");

  if (/^(?:نصيحه|فكره|اقتراح)(?: اليوم)?$|نصيحه اليوم|فكره اليوم/.test(q)) return { kind: "tip" };

  // Questions about today's attendance: "مين غايب اليوم؟", "كم متأخر", "مين ما تسجل".
  const otherTopic = /مهم|مهام|فاتور|فواتير|تسجيل|قبول|فرع|فروع|ولي امر|اولياء/.test(q);
  if (/^(?:مين|من|منو|كم|وش|ايش|اعرض|عطني|ابي)(?:\s|$)/.test(q)) {
    if (otherTopic) return null;
    if (/ما تسجل|ما سجل|لم يسجل|بدون تسجيل|ما انسجل|ما حضروا|ما وصلوا/.test(q)) return { kind: "today", status: "pending" };
    const status = words.map(statusOf).find(Boolean);
    if (status) return { kind: "today", status };
    if (/الحضور اليوم|حضور اليوم|الحضور$/.test(q)) return { kind: "today", status: null };
  }
  if (/^(?:الحضور اليوم|حضور اليوم|ملخص الحضور)$/.test(q)) return { kind: "today", status: null };

  // Classes: "افتح فصل ٣/أ", "الفصول الآن", "الفصل المباشر".
  const classMatch = q.match(/^(?:افتح|ودني|وديني|وريني|اعرض)?\s*(?:الفصل|فصل|الشعبه|شعبه|الصف|صف)\s*(?:المباشر)?\s*(.*)$/);
  if (classMatch && /^(?:افتح|ودني|وديني|وريني|اعرض|الفصل|فصل|الشعبه|شعبه|الصف|صف)/.test(q)) return { kind: "openClass", name: classMatch[1].trim() || null };
  if (/^(?:الفصول|الفصول الان|متابعه الفصول|افتح الفصول)$/.test(q)) return { kind: "openClass", name: null };

  // Tasks: "أنشئ مهمة: تجهيز القاعة بكرة", "ذكرني أتصل بولي أمر سارة".
  const taskMatch = q.match(/^(?:انشي|انشا|انشيء|اضف|ضيف|سو|سوي|اكتب|سجل)\s+(?:لي\s+)?مهم[هت]?\s*(?:جديده)?\s*(.*)$/) ?? q.match(/^(?:ذكرني|ذكرنا)\s+(?:ب|ان\s+)?(.*)$/);
  if (taskMatch) {
    let title = taskMatch[1].trim();
    let due: "today" | "tomorrow" | null = null;
    const dueMatch = title.match(/\s*(?:موعدها\s+)?(اليوم|بكره|بكرا|غدا|الغد)$/);
    if (dueMatch) { due = dueMatch[1] === "اليوم" ? "today" : "tomorrow"; title = title.slice(0, dueMatch.index).trim(); }
    // Keep the person's own wording for the title rather than the normalised form.
    const original = input.replace(/^[\s\S]*?مهم[ةهت]?\s*(?:جديد[ةه])?\s*[:：،-]?\s*/, "").replace(/^\s*(?:ذكرني|ذكرنا)\s+(?:بـ?|أن\s+|ان\s+)?/, "").replace(/\s*(?:موعدها\s+)?(?:اليوم|بكرة|بكره|بكرا|غدًا|غدا|الغد)\s*[.!؟?]*$/, "").trim();
    return { kind: "task", title: (original || title).slice(0, 120), due };
  }

  // Find a student: "ابحث عن ريم", "وين ريم", "ملف سارة".
  const find = q.match(/^(?:ابحث عن|ابحث|دور على|دور|وين|فين|ملف|افتح ملف|بيانات)\s+(.+)$/);
  if (find) return { kind: "find", name: find[1].replace(/^(?:الطالب|الطالبه|الطفل|الطفله)\s+/, "").trim() };

  // Hand over: "سلّم ريم", "تسليم سارة لأمها".
  const pickup = q.match(/^(?:سلم|سلمي|تسليم|استلام)\s+(.+?)(?:\s+(?:ل|لـ|الى|مع)\s*.*)?$/);
  if (pickup) return { kind: "pickup", name: pickup[1].replace(/^(?:الطالب|الطالبه|الطفل|الطفله)\s+/, "").trim() };

  // Attendance: "سجّل ريم حاضرة", "ريم متأخرة", "غياب سارة اليوم".
  if (otherTopic) return null;
  const statusIndex = words.findIndex(word => statusOf(word));
  if (statusIndex >= 0) {
    const status = statusOf(words[statusIndex])!;
    const nameWords = words.filter((word, index) => index !== statusIndex && !filler.test(word));
    if (nameWords.length >= 1 && nameWords.length <= 4) return { kind: "attendance", name: nameWords.join(" "), status };
  }
  return null;
}

/** An ILIKE pattern that tolerates Arabic spelling variants (أ/إ/آ/ا, ة/ه, ى/ي) and escapes wildcards. */
export function nameSearchPattern(name: string): string {
  const cleaned = name.replace(/[%_\\]/g, "").trim().replace(/\s+/g, " ");
  return `%${cleaned.replace(/[اأإآٱ]/g, "_").replace(/[ةه]/g, "_").replace(/[يى]/g, "_").replace(/ /g, "%")}%`;
}
/** Ranks matches: exact name first, then names that start with the query, then the rest. */
export function rankMatches<T extends { full_name: string }>(name: string, rows: T[]): T[] {
  const target = norm(name);
  const score = (row: T) => { const value = norm(row.full_name); return value === target ? 0 : value.startsWith(target) ? 1 : value.split(" ").includes(target) ? 2 : 3; };
  return [...rows].sort((a, b) => score(a) - score(b) || a.full_name.localeCompare(b.full_name, "ar"));
}

export function dueDate(due: "today" | "tomorrow" | null, today: string): string | null {
  if (!due) return null;
  return due === "today" ? today : new Date(Date.parse(today) + 86400_000).toISOString().slice(0, 10);
}
