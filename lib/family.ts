import { arNumber } from "./dates";
/** Labels and helpers for the daily report, announcements and the family portal. */
export const moods = ["happy", "calm", "tired", "upset", "unwell"] as const;
export type Mood = (typeof moods)[number];
export const moodLabels: Record<Mood, string> = { happy: "سعيد", calm: "هادئ", tired: "متعب", upset: "منزعج", unwell: "متوعك" };
export const moodEmoji: Record<Mood, string> = { happy: "😄", calm: "🙂", tired: "🥱", upset: "😟", unwell: "🤒" };
export const portions = ["all", "some", "none"] as const;
export type Portion = (typeof portions)[number];
export const portionLabels: Record<Portion, string> = { all: "أكل كل وجبته", some: "أكل بعضها", none: "ما أكل" };
export const portionShort: Record<Portion, string> = { all: "كامل", some: "بعضه", none: "لا" };
export const meals = [["breakfast", "الفطور"], ["snack", "الوجبة الخفيفة"], ["lunch", "الغداء"]] as const;
export const audiences = ["all", "staff", "families"] as const;
export type Audience = (typeof audiences)[number];
export const audienceLabels: Record<Audience, string> = { all: "الكل", staff: "الموظفين فقط", families: "أولياء الأمور" };

export type DailyReport = {
  child_id: string; report_date: string; mood: Mood | null; breakfast: Portion | null; lunch: Portion | null; snack: Portion | null;
  nap_minutes: number | null; diapers: number | null; activities: string | null; medication: string | null; incident: string | null; notes: string | null;
};
export function napLabel(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  if (minutes === 0) return "ما نام";
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return [h ? `${arNumber(h)} ساعة` : null, m ? `${arNumber(m)} دقيقة` : null].filter(Boolean).join(" و");
}
/** A short WhatsApp-ready summary of one child's day. */
export function reportSummary(name: string, report: Partial<DailyReport>): string {
  const lines = [`يوم ${name} اليوم:`];
  if (report.mood) lines.push(`المزاج: ${moodEmoji[report.mood]} ${moodLabels[report.mood]}`);
  const eaten = meals.filter(([key]) => report[key]).map(([key, label]) => `${label} ${portionShort[report[key] as Portion]}`);
  if (eaten.length) lines.push(`الأكل: ${eaten.join("، ")}`);
  const nap = napLabel(report.nap_minutes);
  if (nap) lines.push(`النوم: ${nap}`);
  if (report.diapers) lines.push(`تغيير الحفاض: ${arNumber(report.diapers)}`);
  if (report.activities) lines.push(`الأنشطة: ${report.activities}`);
  if (report.medication) lines.push(`الدواء: ${report.medication}`);
  if (report.incident) lines.push(`ملاحظة مهمة: ${report.incident}`);
  if (report.notes) lines.push(report.notes);
  return lines.join("\n");
}
export function portalMessage(organization: string, guardian: string, link: string): string {
  return [`هلا ${guardian}،`, `هذا رابط بوابة ولي الأمر في ${organization}. تشوفون فيه حضور أطفالكم وتقاريرهم اليومية والفواتير والإعلانات:`, link, "الرابط خاص بكم، لا تشاركونه."].join("\n");
}
