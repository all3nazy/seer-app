"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { canManage, isEntity, operationValues, organizationValues, uuid, ValidationError } from "../../../lib/operations";

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
