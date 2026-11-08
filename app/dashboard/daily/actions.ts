"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { uuid, ValidationError } from "../../../lib/operations";
import { isIsoDate, riyadhToday } from "../../../lib/students";
import { moods, portions } from "../../../lib/family";

export type ReportResult = { error?: string; success?: string };
const pick = <T extends string>(value: FormDataEntryValue | null, allowed: readonly T[]): T | null => typeof value === "string" && allowed.includes(value as T) ? value as T : null;
const text = (value: FormDataEntryValue | null, max: number) => { const v = typeof value === "string" ? value.trim() : ""; if (v.length > max) throw new ValidationError(`النص لا يتجاوز ${max.toLocaleString("ar-SA")} حرف.`); return v || null; };
const count = (value: FormDataEntryValue | null, max: number) => { if (value === null || value === "") return null; const n = Number(value); if (!Number.isInteger(n) || n < 0 || n > max) throw new ValidationError("رقم غير صالح."); return n; };

/** Saves one child's report for a day; the database stamps the author and blocks other days for staff. */
export async function saveDailyReport(_: ReportResult, data: FormData): Promise<ReportResult> {
  try {
    const org = uuid(data.get("organization_id")), child = uuid(data.get("child_id"));
    const day = data.get("report_date");
    if (!isIsoDate(day) || day > riyadhToday()) return { error: "اختر يومًا صحيحًا." };
    const values = {
      mood: pick(data.get("mood"), moods), breakfast: pick(data.get("breakfast"), portions), lunch: pick(data.get("lunch"), portions), snack: pick(data.get("snack"), portions),
      nap_minutes: count(data.get("nap_minutes"), 600), diapers: count(data.get("diapers"), 20),
      activities: text(data.get("activities"), 500), medication: text(data.get("medication"), 300), incident: text(data.get("incident"), 500), notes: text(data.get("notes"), 1000),
    };
    const client = await createSupabaseServerClient();
    const { data: existing } = await client.from("daily_reports").select("id").eq("organization_id", org).eq("child_id", child).eq("report_date", day).maybeSingle();
    const { error } = existing
      ? await client.from("daily_reports").update(values).eq("id", existing.id as string)
      : await client.from("daily_reports").insert({ ...values, organization_id: org, child_id: child, report_date: day });
    if (error?.code === "42501") return { error: "تعديل الأيام السابقة لمسؤول المنشأة فقط." };
    if (error) return { error: "تعذر حفظ التقرير. حاول مجددًا." };
    revalidatePath("/dashboard/daily");
    return { success: "حُفظ التقرير." };
  } catch (error) { return { error: error instanceof ValidationError ? error.message : "تعذر حفظ التقرير الآن." }; }
}
