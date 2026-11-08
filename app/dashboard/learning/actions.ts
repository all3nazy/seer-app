"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { uuid, ValidationError } from "../../../lib/operations";
import { isIsoDate } from "../../../lib/students";
import { assessmentKinds, behaviorCategories } from "../../../lib/learning";

export type LearnResult = { error?: string; success?: string };
const refresh = () => revalidatePath("/dashboard/learning");
const s = (data: FormData, key: string) => { const v = data.get(key); return typeof v === "string" ? v.trim() : ""; };
const fail = (error: unknown, fallback: string): LearnResult => ({ error: error instanceof ValidationError ? error.message : fallback });

export async function saveSubject(_: LearnResult, data: FormData): Promise<LearnResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const name = s(data, "name");
    if (!name || name.length > 60) return { error: "اكتب اسم المادة." };
    const periods = Number(s(data, "weekly_periods") || 0);
    if (!Number.isInteger(periods) || periods < 0 || periods > 40) return { error: "عدد الحصص من ٠ إلى ٤٠." };
    const grade = s(data, "grade_level_id");
    const db = await createSupabaseServerClient();
    const { error } = await db.from("subjects").insert({ organization_id: org, name, grade_level_id: grade ? uuid(grade) : null, weekly_periods: periods });
    if (error?.code === "23505") return { error: "المادة موجودة لهذا الصف." };
    if (error) return { error: "إضافة المواد لمالك المنشأة أو مديرها." };
    refresh();
    return { success: "أُضيفت المادة." };
  } catch (error) { return fail(error, "تعذر الإضافة."); }
}
export async function deleteRecord(organizationId: string, table: "subjects" | "assessments" | "behavior_notes", id: string): Promise<LearnResult> {
  try {
    if (!["subjects", "assessments", "behavior_notes"].includes(table)) return { error: "غير صالح." };
    const db = await createSupabaseServerClient();
    const { data, error } = await db.from(table).delete().eq("organization_id", uuid(organizationId)).eq("id", uuid(id)).select("id");
    if (error || !data?.length) return { error: "الحذف للمدير أو لصاحب السجل." };
    refresh();
    return { success: "حُذف." };
  } catch { return { error: "تعذر الحذف." }; }
}

/** Sets or clears one timetable cell. */
export async function setSlot(organizationId: string, sectionId: string, weekday: number, period: number, subjectId: string, teacherId: string): Promise<LearnResult> {
  try {
    const org = uuid(organizationId), section = uuid(sectionId);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !Number.isInteger(period) || period < 1 || period > 12) return { error: "خانة غير صالحة." };
    const db = await createSupabaseServerClient();
    const { data: existing } = await db.from("timetable_slots").select("id").eq("section_id", section).eq("weekday", weekday).eq("period", period).maybeSingle();
    if (!subjectId) {
      if (existing) await db.from("timetable_slots").delete().eq("id", existing.id as string);
      refresh();
      return { success: "فُرّغت الحصة." };
    }
    const values = { subject_id: uuid(subjectId), teacher_id: teacherId ? uuid(teacherId) : null };
    const { error } = existing
      ? await db.from("timetable_slots").update(values).eq("id", existing.id as string)
      : await db.from("timetable_slots").insert({ ...values, organization_id: org, section_id: section, weekday, period });
    if (error?.code === "23505") return { error: "المعلم عنده حصة ثانية بنفس الوقت." };
    if (error) return { error: "الجدول يعدّله مالك المنشأة أو مديرها." };
    refresh();
    return { success: "حُفظت الحصة." };
  } catch { return { error: "تعذر الحفظ." }; }
}

export async function createAssessment(_: LearnResult, data: FormData): Promise<LearnResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const title = s(data, "title");
    if (!title || title.length > 120) return { error: "اكتب عنوان التقييم." };
    const kind = s(data, "kind");
    if (!assessmentKinds.includes(kind as (typeof assessmentKinds)[number])) return { error: "اختر نوع التقييم." };
    const max = Number(s(data, "max_score")), weight = Number(s(data, "weight"));
    if (!(max > 0 && max <= 1000) || !(weight > 0 && weight <= 100)) return { error: "الدرجة العظمى والوزن لازم تكون أرقام صحيحة." };
    const due = s(data, "due_date");
    if (due && !isIsoDate(due)) return { error: "تاريخ غير صحيح." };
    const term = s(data, "term_id");
    const db = await createSupabaseServerClient();
    const { error } = await db.from("assessments").insert({ organization_id: org, section_id: uuid(data.get("section_id")), subject_id: uuid(data.get("subject_id")), term_id: term ? uuid(term) : null,
      title, kind, max_score: max, weight, due_date: due || null, description: s(data, "description").slice(0, 1000) || null });
    if (error) return { error: "تعذر إضافة التقييم." };
    refresh();
    return { success: "أُضيف التقييم. أدخل الدرجات من الجدول." };
  } catch (error) { return fail(error, "تعذر الإضافة."); }
}

/** Saves a whole grade sheet: "score:<child>" holds a number, "a" for absent, or empty to clear. */
export async function saveGrades(_: LearnResult, data: FormData): Promise<LearnResult> {
  try {
    const org = uuid(data.get("organization_id")), assessment = uuid(data.get("assessment_id"));
    const max = Number(data.get("max_score"));
    const entries: { child_id: string; score: number | null; absent: boolean }[] = [];
    for (const [key, raw] of data.entries()) {
      if (!key.startsWith("score:") || typeof raw !== "string") continue;
      const value = raw.trim().replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace("٫", ".");
      if (!value) continue;
      const child = uuid(key.slice(6));
      if (/^(غ|a|غائب)$/i.test(value)) { entries.push({ child_id: child, score: null, absent: true }); continue; }
      const score = Number(value);
      if (!Number.isFinite(score) || score < 0 || score > max) return { error: `درجة غير صالحة (${value}). الحد من ٠ إلى ${max}.` };
      entries.push({ child_id: child, score: Math.round(score * 100) / 100, absent: false });
    }
    if (!entries.length) return { error: "أدخل درجة واحدة على الأقل." };
    const db = await createSupabaseServerClient();
    const { data: existing } = await db.from("grades").select("id,child_id").eq("assessment_id", assessment).in("child_id", entries.map(entry => entry.child_id));
    const ids = new Map((existing ?? []).map(row => [row.child_id as string, row.id as string]));
    const inserts = entries.filter(entry => !ids.has(entry.child_id)).map(entry => ({ ...entry, organization_id: org, assessment_id: assessment }));
    if (inserts.length) { const { error } = await db.from("grades").insert(inserts); if (error) return { error: "تعذر حفظ الدرجات." }; }
    for (const entry of entries.filter(entry => ids.has(entry.child_id))) {
      const { error } = await db.from("grades").update({ score: entry.score, absent: entry.absent }).eq("id", ids.get(entry.child_id)!);
      if (error) return { error: "حُفظ جزء من الدرجات فقط." };
    }
    refresh();
    return { success: `حُفظت ${entries.length.toLocaleString("ar-SA")} درجة.` };
  } catch (error) { return fail(error, "تعذر حفظ الدرجات."); }
}

export async function addBehavior(_: LearnResult, data: FormData): Promise<LearnResult> {
  try {
    const org = uuid(data.get("organization_id")), child = uuid(data.get("child_id"));
    const kind = s(data, "kind") === "concern" ? "concern" : "positive";
    const category = s(data, "category");
    if (!behaviorCategories.includes(category as (typeof behaviorCategories)[number])) return { error: "اختر التصنيف." };
    const points = Math.min(5, Math.max(1, Number(s(data, "points") || 1)));
    const db = await createSupabaseServerClient();
    const { error } = await db.from("behavior_notes").insert({ organization_id: org, child_id: child, kind, category, points, note: s(data, "note").slice(0, 500) || null });
    if (error) return { error: "تعذر حفظ الملاحظة." };
    refresh();
    return { success: kind === "positive" ? "سُجّلت نقطة إيجابية ⭐" : "سُجّلت الملاحظة." };
  } catch (error) { return fail(error, "تعذر الحفظ."); }
}
