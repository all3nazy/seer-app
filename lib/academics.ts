import { uuid, ValidationError } from "./operations";
import { isIsoDate } from "./students";

export const stages = ["nursery", "kindergarten", "primary", "intermediate", "secondary"] as const;
export const stageLabels: Record<(typeof stages)[number], string> = { nursery: "حضانة", kindergarten: "روضة", primary: "ابتدائي", intermediate: "متوسط", secondary: "ثانوي" };
export const sectionGenders = ["mixed", "boys", "girls"] as const;
export const sectionGenderLabels: Record<(typeof sectionGenders)[number], string> = { mixed: "مختلط", boys: "بنين", girls: "بنات" };
export const academicTables = ["academic_years", "academic_terms", "holidays", "grade_levels", "sections", "section_staff"] as const;
export type AcademicTable = (typeof academicTables)[number];
export function isAcademicTable(value: unknown): value is AcademicTable { return typeof value === "string" && academicTables.some(table => table === value); }

export type AcademicYear = { id: string; name: string; starts_on: string; ends_on: string; is_current: boolean };
export type AcademicTerm = { id: string; academic_year_id: string; name: string; starts_on: string; ends_on: string };
export type Holiday = { id: string; name: string; starts_on: string; ends_on: string };
export type GradeLevel = { id: string; name: string; stage: (typeof stages)[number]; sort_order: number };
export type Section = { id: string; grade_level_id: string; branch_id: string | null; name: string; gender: (typeof sectionGenders)[number]; capacity: number | null; homeroom_teacher_id: string | null };

function name(data: FormData, max = 60): string {
  const value = data.get("name");
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > max) throw new ValidationError(`اكتب الاسم، من حرف إلى ${max.toLocaleString("ar-SA")} حرفًا.`);
  return value.trim();
}
function range(data: FormData, allowSameDay: boolean): { starts_on: string; ends_on: string } {
  const start = data.get("starts_on"), end = data.get("ends_on");
  if (!isIsoDate(start) || !isIsoDate(end)) throw new ValidationError("أدخل تاريخ البداية والنهاية.");
  if (allowSameDay ? end < start : end <= start) throw new ValidationError("تاريخ النهاية لازم يكون بعد البداية.");
  return { starts_on: start, ends_on: end };
}
function choice<T extends string>(data: FormData, key: string, allowed: readonly T[]): T {
  const value = data.get(key);
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new ValidationError("القيمة المحددة غير صالحة.");
  return value as T;
}
function optionalId(data: FormData, key: string): string | null { const value = data.get(key); return value ? uuid(value) : null; }

/** Column values the browser may send for each table; identifiers and tenant are added by the server. */
export function academicValues(table: AcademicTable, data: FormData, editing: boolean): Record<string, string | number | boolean | null> {
  switch (table) {
    case "academic_years": return { name: name(data), ...range(data, false), is_current: data.get("is_current") === "on" };
    case "academic_terms": return { name: name(data), ...range(data, false), ...(editing ? {} : { academic_year_id: uuid(data.get("academic_year_id")) }) };
    case "holidays": return { name: name(data, 80), ...range(data, true) };
    case "grade_levels": {
      const order = Number(data.get("sort_order") ?? 0);
      if (!Number.isInteger(order) || order < 0 || order > 1000) throw new ValidationError("الترتيب رقم من ٠ إلى ١٠٠٠.");
      return { name: name(data), stage: choice(data, "stage", stages), sort_order: order };
    }
    case "sections": {
      const raw = data.get("capacity");
      const capacity = raw ? Number(raw) : null;
      if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 200)) throw new ValidationError("السعة رقم من ١ إلى ٢٠٠.");
      return { name: name(data), grade_level_id: uuid(data.get("grade_level_id")), branch_id: optionalId(data, "branch_id"), gender: choice(data, "gender", sectionGenders), capacity, homeroom_teacher_id: optionalId(data, "homeroom_teacher_id") };
    }
    case "section_staff": {
      const duty = data.get("duty");
      if (duty !== null && (typeof duty !== "string" || duty.trim().length > 60)) throw new ValidationError("المهمة لا تتجاوز ٦٠ حرفًا.");
      const cleaned = typeof duty === "string" && duty.trim() ? duty.trim() : null;
      return editing ? { duty: cleaned } : { section_id: uuid(data.get("section_id")), user_id: uuid(data.get("user_id")), duty: cleaned };
    }
  }
}

export function sectionLabel(section: Pick<Section, "name" | "grade_level_id"> | undefined, grades: Pick<GradeLevel, "id" | "name">[]): string {
  if (!section) return "بدون شعبة";
  const grade = grades.find(item => item.id === section.grade_level_id);
  return grade ? `${grade.name} — ${section.name}` : section.name;
}
/** The holiday covering a day, if any. */
export function holidayOn(day: string, holidays: Pick<Holiday, "name" | "starts_on" | "ends_on">[]): string | null {
  return holidays.find(item => item.starts_on <= day && day <= item.ends_on)?.name ?? null;
}
