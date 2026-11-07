"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { canManage, isEntity, operationValues, organizationValues, uuid, ValidationError } from "../../../lib/operations";
import { relationshipValue } from "../../../lib/team";

export type OperationResult = { error?: string; success?: string };

async function authorizedClient(org: string) {
  const client = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return { error: "انتهت الجلسة. سجل الدخول مجددًا." } as const;
  const { data: member, error: memberError } = await client.from("memberships").select("role").eq("organization_id", org).eq("user_id", user.id).maybeSingle();
  if (memberError || !canManage(member?.role)) return { error: "لا تملك صلاحية تعديل هذه المنشأة." } as const;
  return { client } as const;
}
function refreshOperations() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/assistant");
}
export async function saveOperation(_: OperationResult, data: FormData): Promise<OperationResult> {
  try {
    if (data.get("confirmed") !== "yes") return { error: "يرجى تأكيد حفظ التغيير." };
    const org = uuid(data.get("organization_id"));
    const entity = data.get("entity");
    if (typeof entity !== "string" || !isEntity(entity)) return { error: "خدمة غير صالحة." };
    const values = operationValues(entity, data);
    const authorized = await authorizedClient(org);
    if ("error" in authorized) return { error: authorized.error };
    const client = authorized.client;
    // Referenced records are checked under the current user's RLS and chosen tenant.
    // Composite foreign keys enforce the same boundary atomically in PostgreSQL.
    for (const [field, table] of [["child_id", "children"], ["branch_id", "branches"], ["guardian_id", "guardians"]]) {
      if (values[field]) {
        const { data: record, error } = await client.from(table).select("id").eq("organization_id", org).eq("id", values[field]).maybeSingle();
        if (error || !record) return { error: "السجل المرتبط غير متاح في هذه المنشأة. أعد تحميل الصفحة." };
      }
    }
    const id = data.get("record_id");
    const query = id
      ? client.from(entity).update(values).eq("id", uuid(id)).eq("organization_id", org)
      : client.from(entity).insert({ ...values, organization_id: org });
    const { data: record, error } = await query.select("id").maybeSingle();
    if (error || !record) return { error: "تعذر الحفظ. ربما تغيّرت صلاحياتك أو بيانات السجل؛ أعد تحميل الصفحة وحاول مجددًا." };
    refreshOperations();
    return { success: "تم حفظ البيانات وتسجيل العملية في سجل التدقيق." };
  } catch (error) {
    return { error: error instanceof ValidationError ? error.message : "تعذر الحفظ حاليًا. حاول مجددًا لاحقًا." };
  }
}
export async function saveOrganization(_: OperationResult, data: FormData): Promise<OperationResult> {
  try {
    if (data.get("confirmed") !== "yes") return { error: "يرجى تأكيد حفظ التغيير." };
    const org = uuid(data.get("organization_id"));
    const values = organizationValues(data);
    const authorized = await authorizedClient(org);
    if ("error" in authorized) return { error: authorized.error };
    const { data: record, error } = await authorized.client.from("organizations").update(values).eq("id", org).select("id").maybeSingle();
    if (error || !record) return { error: "تعذر تحديث إعدادات المنشأة. أعد تحميل الصفحة وحاول مجددًا." };
    refreshOperations();
    return { success: "تم حفظ إعدادات المنشأة وتسجيل العملية في سجل التدقيق." };
  } catch (error) {
    return { error: error instanceof ValidationError ? error.message : "تعذر الحفظ حاليًا. حاول مجددًا لاحقًا." };
  }
}

const blockedDelete: Record<string, string> = {
  branches: "الفرع مرتبط بطلبات تسجيل. انقلها لفرع آخر أو احذفها أولًا.",
  children: "الطفل له طلبات تسجيل. احذفها أولًا، بعدها تقدر تحذف ملفه.",
  guardians: "ولي الأمر مرتبط بفواتير. احذف الفواتير المسودة أو ألغِ ربطها أولًا.",
};
export async function deleteOperation(_: OperationResult, data: FormData): Promise<OperationResult> {
  try {
    if (data.get("confirmed") !== "yes") return { error: "أكّد الحذف أولًا." };
    const org = uuid(data.get("organization_id"));
    const entity = data.get("entity");
    if (typeof entity !== "string" || !isEntity(entity)) return { error: "خدمة غير صالحة." };
    const id = uuid(data.get("record_id"));
    const authorized = await authorizedClient(org);
    if ("error" in authorized) return { error: authorized.error };
    const { data: record, error } = await authorized.client.from(entity).delete().eq("id", id).eq("organization_id", org).select("id").maybeSingle();
    if (error?.code === "23503") return { error: blockedDelete[entity] ?? "السجل مرتبط بسجلات أخرى. احذفها أولًا." };
    if (!error && !record && entity === "invoices") return { error: "الفاتورة الصادرة أو المسددة ما تنحذف حفاظًا على السجل المالي. غيّر حالتها إلى «ملغاة»." };
    if (error || !record) return { error: "تعذر الحذف. ربما حُذف السجل من قبل؛ أعد تحميل الصفحة." };
    refreshOperations();
    return { success: "حُذف السجل وسُجّلت العملية في سجل التدقيق." };
  } catch (error) {
    return { error: error instanceof ValidationError ? error.message : "تعذر الحذف حاليًا. حاول مجددًا لاحقًا." };
  }
}
export async function linkGuardian(_: OperationResult, data: FormData): Promise<OperationResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const child = uuid(data.get("child_id"));
    const guardian = uuid(data.get("guardian_id"));
    const relationship = relationshipValue(data.get("relationship"));
    const authorized = await authorizedClient(org);
    if ("error" in authorized) return { error: authorized.error };
    // Composite foreign keys reject a child or guardian from another organization.
    const { error } = await authorized.client.from("child_guardians").insert({ organization_id: org, child_id: child, guardian_id: guardian, relationship });
    if (error?.code === "23505") return { error: "هذا الطفل مربوط بولي الأمر هذا من قبل." };
    if (error?.code === "23503") return { error: "الطفل أو ولي الأمر غير متاح في هذه المنشأة. أعد تحميل الصفحة." };
    if (error) return { error: "تعذر الربط. أعد تحميل الصفحة وحاول مجددًا." };
    refreshOperations();
    return { success: "تم ربط الطفل بولي أمره." };
  } catch (error) {
    return { error: error instanceof ValidationError ? error.message : "تعذر الربط حاليًا. حاول مجددًا لاحقًا." };
  }
}
export async function unlinkGuardian(organizationId: string, childId: string, guardianId: string): Promise<OperationResult> {
  try {
    const org = uuid(organizationId);
    const authorized = await authorizedClient(org);
    if ("error" in authorized) return { error: authorized.error };
    const { data: link, error } = await authorized.client.from("child_guardians").delete()
      .eq("organization_id", org).eq("child_id", uuid(childId)).eq("guardian_id", uuid(guardianId)).select("child_id").maybeSingle();
    if (error || !link) return { error: "تعذر إلغاء الربط. أعد تحميل الصفحة." };
    refreshOperations();
    return { success: "أُلغي الربط." };
  } catch (error) {
    return { error: error instanceof ValidationError ? error.message : "تعذر إلغاء الربط حاليًا." };
  }
}
