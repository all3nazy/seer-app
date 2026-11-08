"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { canManage, uuid, ValidationError } from "../../../lib/operations";
import { reviewValues } from "../../../lib/admissions";

export type AdmissionResult = { error?: string; success?: string; childId?: string };

async function managerClient(org: string) {
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { error: "انتهت الجلسة. سجل الدخول مجددًا." } as const;
  const { data: member, error: memberError } = await client.from("memberships").select("role").eq("organization_id", org).eq("user_id", user.id).maybeSingle();
  if (memberError || !canManage(member?.role)) return { error: "القبول لمسؤول المنشأة فقط." } as const;
  return { client } as const;
}
const fail = (error: unknown, fallback: string): AdmissionResult => ({ error: error instanceof ValidationError ? error.message : fallback });

export async function saveAdmissionSettings(_: AdmissionResult, data: FormData): Promise<AdmissionResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const intro = data.get("intro");
    if (intro && (typeof intro !== "string" || intro.length > 1000)) return { error: "النص التعريفي لا يتجاوز ١٠٠٠ حرف." };
    const limit = Number(data.get("daily_limit") ?? 100);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return { error: "الحد اليومي رقم من ١ إلى ١٠٠٠." };
    const values = { is_open: data.get("is_open") === "on", intro: typeof intro === "string" && intro.trim() ? intro.trim() : null, daily_limit: limit };
    const auth = await managerClient(org);
    if ("error" in auth) return { error: auth.error };
    const { data: existing } = await auth.client.from("admission_settings").select("organization_id").eq("organization_id", org).maybeSingle();
    const { error } = existing
      ? await auth.client.from("admission_settings").update(values).eq("organization_id", org)
      : await auth.client.from("admission_settings").insert({ ...values, organization_id: org });
    if (error) return { error: "تعذر حفظ إعدادات القبول. أعد تحميل الصفحة." };
    revalidatePath("/dashboard/admissions");
    return { success: values.is_open ? "التقديم مفتوح الحين." : "التقديم مغلق." };
  } catch (error) { return fail(error, "تعذر الحفظ حاليًا."); }
}

export async function reviewApplication(_: AdmissionResult, data: FormData): Promise<AdmissionResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const id = uuid(data.get("application_id"));
    const values = reviewValues(data);
    const auth = await managerClient(org);
    if ("error" in auth) return { error: auth.error };
    const { data: record, error } = await auth.client.from("applications").update(values).eq("id", id).eq("organization_id", org).neq("status", "enrolled").select("id").maybeSingle();
    if (error?.code === "23503") return { error: "الصف المختار غير متاح. أعد تحميل الصفحة." };
    if (error || !record) return { error: "تعذر الحفظ. ربما الطلب تحوّل لطالب أو انحذف؛ أعد تحميل الصفحة." };
    revalidatePath("/dashboard/admissions");
    revalidatePath(`/dashboard/admissions/${id}`);
    return { success: "حُفظت المراجعة." };
  } catch (error) { return fail(error, "تعذر الحفظ حاليًا."); }
}

export async function convertApplication(_: AdmissionResult, data: FormData): Promise<AdmissionResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const id = uuid(data.get("application_id"));
    const section = data.get("section_id");
    const auth = await managerClient(org);
    if ("error" in auth) return { error: auth.error };
    const { data: child, error } = await auth.client.rpc("convert_application", { application: id, section: section ? uuid(section) : null });
    if (error?.code === "23505") return { error: "هذا الطلب تحوّل لطالب من قبل." };
    if (error?.code === "23514") return { error: "الطلبات المرفوضة أو المنسحبة ما تتحوّل لطالب. غيّر الحالة أولًا." };
    if (error?.code === "23503") return { error: "الشعبة المختارة غير متاحة في هذه المنشأة." };
    if (error || typeof child !== "string") return { error: "تعذر التحويل. أعد تحميل الصفحة وحاول مجددًا." };
    for (const path of ["/dashboard/admissions", `/dashboard/admissions/${id}`, "/dashboard/children", "/dashboard/operations"]) revalidatePath(path);
    return { success: "صار الطفل طالبًا، وانضاف ولي أمره وطلب تسجيل مقبول.", childId: child };
  } catch (error) { return fail(error, "تعذر التحويل حاليًا."); }
}

export async function deleteApplication(organizationId: string, applicationId: string): Promise<AdmissionResult> {
  try {
    const org = uuid(organizationId);
    const auth = await managerClient(org);
    if ("error" in auth) return { error: auth.error };
    const { data: record, error } = await auth.client.from("applications").delete().eq("id", uuid(applicationId)).eq("organization_id", org).select("id").maybeSingle();
    if (error || !record) return { error: "يُحذف الطلب المرفوض أو المنسحب فقط." };
    revalidatePath("/dashboard/admissions");
    return { success: "حُذف الطلب." };
  } catch (error) { return fail(error, "تعذر الحذف حاليًا."); }
}
