"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { canManage, uuid, ValidationError } from "../../../lib/operations";
import { taskId, taskStatus, taskValues, type Task } from "../../../lib/tasks";

export type TaskResult = { error?: string; success?: string; task?: Task };
const columns = "id,title,notes,status,priority,due_date,completed_at,assignee_id";

// Each action re-checks the session and membership; RLS and the guard trigger enforce the same rules again in PostgreSQL.
async function member(org: string, needsManager: boolean) {
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { error: "انتهت الجلسة. سجّل الدخول مجددًا." } as const;
  const { data, error: memberError } = await client.from("memberships").select("role").eq("organization_id", org).eq("user_id", user.id).maybeSingle();
  if (memberError || !data) return { error: "لا تملك صلاحية على هذه المنشأة." } as const;
  if (needsManager && !canManage(data.role)) return { error: "إضافة المهام وتعديلها وحذفها لمالك المنشأة أو مديرها." } as const;
  return { client } as const;
}
function failure(error: unknown): TaskResult {
  return { error: error instanceof ValidationError ? error.message : "تعذر الحفظ الآن. حاول مجددًا بعد قليل." };
}
function refresh() { revalidatePath("/dashboard"); revalidatePath("/dashboard/tasks"); }

export async function createTask(data: FormData): Promise<TaskResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const values = taskValues(data);
    const access = await member(org, true);
    if ("error" in access) return { error: access.error };
    const { data: task, error } = await access.client.from("tasks").insert({ ...values, organization_id: org }).select(columns).single();
    if (error?.code === "23503") return { error: "الشخص المختار لم يعد عضوًا في المنشأة. أعد تحميل الصفحة." };
    if (error || !task) return { error: "تعذر إضافة المهمة. أعد تحميل الصفحة وحاول مجددًا." };
    refresh();
    return { success: "أُضيفت المهمة", task: task as Task };
  } catch (error) { return failure(error); }
}
export async function updateTask(data: FormData): Promise<TaskResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const id = taskId(data.get("task_id"));
    const values = taskValues(data);
    const access = await member(org, true);
    if ("error" in access) return { error: access.error };
    const { data: task, error } = await access.client.from("tasks").update(values).eq("id", id).eq("organization_id", org).select(columns).maybeSingle();
    if (error?.code === "23503") return { error: "الشخص المختار لم يعد عضوًا في المنشأة. أعد تحميل الصفحة." };
    if (error || !task) return { error: "تعذر حفظ التعديل. ربما حُذفت المهمة؛ أعد تحميل الصفحة." };
    refresh();
    return { success: "حُفظت التعديلات", task: task as Task };
  } catch (error) { return failure(error); }
}
export async function moveTask(organizationId: string, id: string, status: string): Promise<TaskResult> {
  try {
    const org = uuid(organizationId);
    const target = taskStatus(status);
    const access = await member(org, false);
    if ("error" in access) return { error: access.error };
    const { data: task, error } = await access.client.from("tasks").update({ status: target }).eq("id", taskId(id)).eq("organization_id", org).select(columns).maybeSingle();
    if (error || !task) return { error: "تعذر نقل المهمة. أعد تحميل الصفحة وحاول مجددًا." };
    refresh();
    return { task: task as Task };
  } catch (error) { return failure(error); }
}
export async function deleteTask(organizationId: string, id: string): Promise<TaskResult> {
  try {
    const org = uuid(organizationId);
    const access = await member(org, true);
    if ("error" in access) return { error: access.error };
    const { data: task, error } = await access.client.from("tasks").delete().eq("id", taskId(id)).eq("organization_id", org).select("id").maybeSingle();
    if (error || !task) return { error: "تعذر حذف المهمة. أعد تحميل الصفحة." };
    refresh();
    return { success: "حُذفت المهمة" };
  } catch (error) { return failure(error); }
}
