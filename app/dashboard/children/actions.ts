"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, authUser } from "../../../lib/supabase/server";
import { canManage, uuid, ValidationError } from "../../../lib/operations";
import { attendanceEntries, healthValues, isIsoDate, profileValues, riyadhToday } from "../../../lib/students";

export type ActionResult = { error?: string; success?: string; id?: string };

async function memberClient(org: string, needManager: boolean) {
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await authUser(client);
  if (error || !user) return { error: "انتهت الجلسة. سجل الدخول مجددًا." } as const;
  const { data: member, error: memberError } = await client.from("memberships").select("role").eq("organization_id", org).eq("user_id", user.id).maybeSingle();
  if (memberError || !member) return { error: "لا تملك صلاحية على هذه المنشأة." } as const;
  if (needManager && !canManage(member.role)) return { error: "التعديل لمسؤول المنشأة فقط." } as const;
  return { client, manager: canManage(member.role) } as const;
}
const failure = (error: unknown, fallback: string): ActionResult => ({ error: error instanceof ValidationError ? error.message : fallback });

export async function saveStudentProfile(_: ActionResult, data: FormData): Promise<ActionResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const values = profileValues(data);
    const auth = await memberClient(org, true);
    if ("error" in auth) return { error: auth.error };
    const id = data.get("child_id");
    const query = id
      ? auth.client.from("children").update(values).eq("id", uuid(id)).eq("organization_id", org)
      : auth.client.from("children").insert({ ...values, organization_id: org });
    const { data: record, error } = await query.select("id").maybeSingle();
    if (error?.code === "23503") return { error: "الفرع المختار غير متاح في هذه المنشأة. أعد تحميل الصفحة." };
    if (error || !record) return { error: "تعذر حفظ ملف الطالب. أعد تحميل الصفحة وحاول مجددًا." };
    revalidatePath("/dashboard/children");
    revalidatePath(`/dashboard/children/${record.id}`);
    revalidatePath("/dashboard/operations");
    return { success: id ? "حُفظ ملف الطالب." : "أُضيف الطالب.", id: record.id };
  } catch (error) { return failure(error, "تعذر الحفظ حاليًا. حاول مجددًا لاحقًا."); }
}

export async function saveStudentHealth(_: ActionResult, data: FormData): Promise<ActionResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const child = uuid(data.get("child_id"));
    const values = healthValues(data);
    const auth = await memberClient(org, true);
    if ("error" in auth) return { error: auth.error };
    const { data: existing, error: readError } = await auth.client.from("child_health").select("child_id").eq("organization_id", org).eq("child_id", child).maybeSingle();
    if (readError) return { error: "تعذر قراءة الملف الصحي. أعد تحميل الصفحة." };
    const query = existing
      ? auth.client.from("child_health").update(values).eq("organization_id", org).eq("child_id", child)
      : auth.client.from("child_health").insert({ ...values, organization_id: org, child_id: child });
    const { data: record, error } = await query.select("child_id").maybeSingle();
    if (error || !record) return { error: "تعذر حفظ الملف الصحي. أعد تحميل الصفحة وحاول مجددًا." };
    revalidatePath(`/dashboard/children/${child}`);
    return { success: "حُفظ الملف الصحي." };
  } catch (error) { return failure(error, "تعذر الحفظ حاليًا. حاول مجددًا لاحقًا."); }
}

/** Saves a whole attendance sheet: new rows are inserted, changed rows updated, unchanged rows skipped. */
export async function saveAttendance(_: ActionResult, data: FormData): Promise<ActionResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const day = data.get("attendance_date");
    if (!isIsoDate(day) || day > riyadhToday()) return { error: "اختر يومًا صحيحًا لا يتجاوز اليوم." };
    const entries = attendanceEntries(data);
    if (!entries.length) return { error: "حدد حالة طالب واحد على الأقل." };
    const auth = await memberClient(org, false);
    if ("error" in auth) return { error: auth.error };
    if (day !== riyadhToday() && !auth.manager) return { error: "تعديل الأيام السابقة لمسؤول المنشأة فقط." };
    const { data: existing, error: readError } = await auth.client.from("attendance").select("child_id,status,note")
      .eq("organization_id", org).eq("attendance_date", day).in("child_id", entries.map(entry => entry.child_id));
    if (readError) return { error: "تعذر قراءة كشف الحضور. أعد تحميل الصفحة." };
    const current = new Map((existing ?? []).map(row => [row.child_id as string, row]));
    const inserts = entries.filter(entry => !current.has(entry.child_id));
    const updates = entries.filter(entry => { const row = current.get(entry.child_id); return row && (row.status !== entry.status || (row.note ?? null) !== entry.note); });
    if (inserts.length) {
      const { error } = await auth.client.from("attendance").insert(inserts.map(entry => ({ ...entry, organization_id: org, attendance_date: day })));
      if (error?.code === "23503") return { error: "بعض الطلاب غير متاحين في هذه المنشأة. أعد تحميل الصفحة." };
      if (error) return { error: "تعذر حفظ الحضور. أعد تحميل الصفحة وحاول مجددًا." };
    }
    for (const entry of updates) {
      const { error } = await auth.client.from("attendance").update({ status: entry.status, note: entry.note })
        .eq("organization_id", org).eq("attendance_date", day).eq("child_id", entry.child_id);
      if (error) return { error: "حُفظ جزء من الكشف فقط. أعد تحميل الصفحة وراجع الحالات." };
    }
    revalidatePath("/dashboard/attendance");
    revalidatePath("/dashboard");
    const changed = inserts.length + updates.length;
    return { success: changed ? `حُفظ الحضور (${changed.toLocaleString("ar-SA")} تغيير).` : "ما فيه تغييرات جديدة." };
  } catch (error) { return failure(error, "تعذر حفظ الحضور حاليًا. حاول مجددًا لاحقًا."); }
}

/** Withdraw, graduate or re-activate a student. History stays; daily lists and fee plans skip non-active students. */
export async function setStudentStatus(organizationId: string, childId: string, status: string): Promise<ActionResult> {
  try {
    if (!["active", "withdrawn", "graduated"].includes(status)) return { error: "حالة غير صالحة." };
    const org = uuid(organizationId);
    const auth = await memberClient(org, true);
    if ("error" in auth) return { error: auth.error };
    const { data, error } = await auth.client.from("children").update({ status }).eq("organization_id", org).eq("id", uuid(childId)).select("id");
    if (error || !data?.length) return { error: "تعذر تحديث حالة الطالب." };
    revalidatePath("/dashboard/children");
    revalidatePath(`/dashboard/children/${childId}`);
    return { success: status === "active" ? "رجع الطالب لقائمة الدراسة." : status === "withdrawn" ? "سُجّل انسحاب الطالب. سجله محفوظ، وما عاد يظهر في الحضور والتسليم والباص." : "سُجّل تخرّج الطالب. سجله محفوظ." };
  } catch (error) { return failure(error, "تعذر التحديث."); }
}
