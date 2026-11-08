"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, authUser } from "../../../lib/supabase/server";
import { canManage, uuid, ValidationError } from "../../../lib/operations";
import { academicValues, isAcademicTable } from "../../../lib/academics";

export type AcademicResult = { error?: string; success?: string };

async function managerClient(org: string) {
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await authUser(client);
  if (error || !user) return { error: "انتهت الجلسة. سجل الدخول مجددًا." } as const;
  const { data: member, error: memberError } = await client.from("memberships").select("role").eq("organization_id", org).eq("user_id", user.id).maybeSingle();
  if (memberError || !canManage(member?.role)) return { error: "التعديل لمسؤول المنشأة فقط." } as const;
  return { client } as const;
}
function refresh() {
  for (const path of ["/dashboard/academics", "/dashboard/children", "/dashboard/attendance"]) revalidatePath(path);
}
const messages: Record<string, string> = {
  "23505": "فيه سجل بنفس الاسم، أو سنة دراسية حالية ثانية. غيّر الاسم أو ألغِ تحديد السنة الحالية الأخرى أولًا.",
  "23503": "السجل مرتبط بسجلات ثانية (مثل شُعب داخل الصف) أو غير متاح في هذه المنشأة.",
  "23514": "تحقق من التواريخ والقيم.",
};

export async function saveAcademic(_: AcademicResult, data: FormData): Promise<AcademicResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const table = data.get("table");
    if (!isAcademicTable(table)) return { error: "قسم غير صالح." };
    const id = data.get("record_id");
    const values = academicValues(table, data, Boolean(id));
    const auth = await managerClient(org);
    if ("error" in auth) return { error: auth.error };
    // Setting a new current year clears the previous one first, so the unique index holds.
    if (table === "academic_years" && values.is_current) {
      const { error } = await auth.client.from("academic_years").update({ is_current: false }).eq("organization_id", org).eq("is_current", true);
      if (error) return { error: "تعذر تحديث السنة الحالية. أعد تحميل الصفحة." };
    }
    const query = id
      ? auth.client.from(table).update(values).eq("id", uuid(id)).eq("organization_id", org)
      : auth.client.from(table).insert({ ...values, organization_id: org });
    const { data: record, error } = await query.select("id").maybeSingle();
    if (error) return { error: messages[error.code ?? ""] ?? "تعذر الحفظ. أعد تحميل الصفحة وحاول مجددًا." };
    if (!record) return { error: "تعذر الحفظ. ربما حُذف السجل؛ أعد تحميل الصفحة." };
    refresh();
    return { success: id ? "حُفظت التعديلات." : "أُضيف السجل." };
  } catch (error) {
    return { error: error instanceof ValidationError ? error.message : "تعذر الحفظ حاليًا. حاول مجددًا لاحقًا." };
  }
}

export async function deleteAcademic(organizationId: string, table: string, recordId: string): Promise<AcademicResult> {
  try {
    const org = uuid(organizationId);
    if (!isAcademicTable(table)) return { error: "قسم غير صالح." };
    const auth = await managerClient(org);
    if ("error" in auth) return { error: auth.error };
    const { data: record, error } = await auth.client.from(table).delete().eq("id", uuid(recordId)).eq("organization_id", org).select("id").maybeSingle();
    if (error?.code === "23503") return { error: "ما ينحذف لأنه مرتبط بسجلات ثانية. احذف الشُعب داخل الصف أولًا." };
    if (error || !record) return { error: "تعذر الحذف. أعد تحميل الصفحة." };
    refresh();
    return { success: "حُذف السجل." };
  } catch (error) {
    return { error: error instanceof ValidationError ? error.message : "تعذر الحذف حاليًا." };
  }
}

/** Places students in a section, or removes them from it when section is empty. */
export async function assignStudents(_: AcademicResult, data: FormData): Promise<AcademicResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const target = data.get("section_id");
    const section = target ? uuid(target) : null;
    const children = data.getAll("child_id").map(uuid);
    if (!children.length) return { error: "اختر طالبًا واحدًا على الأقل." };
    if (children.length > 500) return { error: "اختر ٥٠٠ طالب كحد أقصى في المرة." };
    const auth = await managerClient(org);
    if ("error" in auth) return { error: auth.error };
    const { data: updated, error } = await auth.client.from("children").update({ section_id: section }).eq("organization_id", org).in("id", children).select("id");
    if (error?.code === "23503") return { error: "الشعبة غير متاحة في هذه المنشأة. أعد تحميل الصفحة." };
    if (error) return { error: "تعذر نقل الطلاب. أعد تحميل الصفحة." };
    refresh();
    return { success: section ? `نُقل ${(updated?.length ?? 0).toLocaleString("ar-SA")} طالب إلى الشعبة.` : `أُخرج ${(updated?.length ?? 0).toLocaleString("ar-SA")} طالب من الشعبة.` };
  } catch (error) {
    return { error: error instanceof ValidationError ? error.message : "تعذر نقل الطلاب حاليًا." };
  }
}
