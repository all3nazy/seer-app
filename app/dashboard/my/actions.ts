"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { canManage, uuid, ValidationError } from "../../../lib/operations";
import { inquiryValues, isInquiryStatus, messageBody } from "../../../lib/inquiries";

export type WorkResult = { error?: string; success?: string; id?: string };

async function memberClient(org: string) {
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { error: "انتهت الجلسة. سجل الدخول مجددًا." } as const;
  const { data: member, error: memberError } = await client.from("memberships").select("role").eq("organization_id", org).eq("user_id", user.id).maybeSingle();
  if (memberError || !member) return { error: "لا تملك صلاحية على هذه المنشأة." } as const;
  return { client, manager: canManage(member.role) } as const;
}
const fail = (error: unknown, fallback: string): WorkResult => ({ error: error instanceof ValidationError ? error.message : fallback });
function refresh(paths: string[]) { for (const path of ["/dashboard/my", "/dashboard/inquiries", ...paths]) revalidatePath(path); }

export async function addTaskComment(_: WorkResult, data: FormData): Promise<WorkResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const task = uuid(data.get("task_id"));
    const body = messageBody(data, "body", 1000);
    const auth = await memberClient(org);
    if ("error" in auth) return { error: auth.error };
    const { error } = await auth.client.from("task_comments").insert({ organization_id: org, task_id: task, body });
    if (error) return { error: "تعذر إضافة التعليق. أعد تحميل الصفحة." };
    refresh([`/dashboard/tasks/${task}`]);
    return { success: "أُضيف التعليق." };
  } catch (error) { return fail(error, "تعذر إضافة التعليق حاليًا."); }
}
export async function deleteTaskComment(organizationId: string, taskId: string, commentId: string): Promise<WorkResult> {
  try {
    const org = uuid(organizationId);
    const auth = await memberClient(org);
    if ("error" in auth) return { error: auth.error };
    const { data, error } = await auth.client.from("task_comments").delete().eq("id", uuid(commentId)).eq("organization_id", org).select("id").maybeSingle();
    if (error || !data) return { error: "تحذف تعليقك خلال يوم من كتابته فقط." };
    refresh([`/dashboard/tasks/${uuid(taskId)}`]);
    return { success: "حُذف التعليق." };
  } catch (error) { return fail(error, "تعذر الحذف حاليًا."); }
}

export async function createInquiry(_: WorkResult, data: FormData): Promise<WorkResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const values = inquiryValues(data);
    const auth = await memberClient(org);
    if ("error" in auth) return { error: auth.error };
    const { data: record, error } = await auth.client.from("inquiries").insert({ ...values, organization_id: org }).select("id").maybeSingle();
    if (error || !record) return { error: "تعذر إرسال الاستفسار. أعد تحميل الصفحة." };
    refresh([]);
    return { success: "وصل استفسارك للإدارة.", id: record.id };
  } catch (error) { return fail(error, "تعذر الإرسال حاليًا."); }
}
export async function replyInquiry(_: WorkResult, data: FormData): Promise<WorkResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const inquiry = uuid(data.get("inquiry_id"));
    const body = messageBody(data);
    const auth = await memberClient(org);
    if ("error" in auth) return { error: auth.error };
    const { error } = await auth.client.from("inquiry_replies").insert({ organization_id: org, inquiry_id: inquiry, body });
    if (error) return { error: "تعذر إرسال الرد. ربما الاستفسار مغلق؛ أعد تحميل الصفحة." };
    refresh([`/dashboard/inquiries/${inquiry}`]);
    return { success: "أُرسل الرد." };
  } catch (error) { return fail(error, "تعذر الإرسال حاليًا."); }
}
export async function setInquiryStatus(organizationId: string, inquiryId: string, status: string): Promise<WorkResult> {
  try {
    const org = uuid(organizationId), inquiry = uuid(inquiryId);
    if (!isInquiryStatus(status)) return { error: "حالة غير صالحة." };
    const auth = await memberClient(org);
    if ("error" in auth) return { error: auth.error };
    const { data, error } = await auth.client.from("inquiries").update({ status }).eq("id", inquiry).eq("organization_id", org).select("id").maybeSingle();
    if (error || !data) return { error: "تعذر تغيير الحالة." };
    refresh([`/dashboard/inquiries/${inquiry}`]);
    return { success: status === "closed" ? "أُغلق الاستفسار." : "تغيّرت الحالة." };
  } catch (error) { return fail(error, "تعذر تغيير الحالة حاليًا."); }
}
