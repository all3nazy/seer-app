"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, authUser } from "../../../lib/supabase/server";
import { uuid, ValidationError } from "../../../lib/operations";
import { isAttendanceStatus, riyadhToday } from "../../../lib/students";

export type MarkResult = { error?: string; success?: string };

/**
 * One tap on the live class screen: today's status for one student. The database stamps who and
 * when, writes the change history and the audit log, and refuses other tenants.
 */
export async function markAttendance(organizationId: string, childId: string, status: string): Promise<MarkResult> {
  try {
    const org = uuid(organizationId), child = uuid(childId);
    if (!isAttendanceStatus(status)) return { error: "اختر حالة صحيحة." };
    const client = await createSupabaseServerClient();
    const { data: { user } } = await authUser(client);
    if (!user) return { error: "انتهت الجلسة. سجل الدخول مجددًا." };
    const day = riyadhToday();
    const { data: existing, error: readError } = await client.from("attendance").select("status").eq("organization_id", org).eq("child_id", child).eq("attendance_date", day).maybeSingle();
    if (readError) return { error: "تعذر قراءة الحضور. أعد تحميل الصفحة." };
    if (existing?.status === status) return { success: "الحالة مسجّلة من قبل." };
    const { error } = existing
      ? await client.from("attendance").update({ status }).eq("organization_id", org).eq("child_id", child).eq("attendance_date", day)
      : await client.from("attendance").insert({ organization_id: org, child_id: child, attendance_date: day, status });
    if (error?.code === "42501" || error?.code === "23503") return { error: "لا تملك صلاحية على هذا الطالب." };
    if (error) return { error: "تعذر حفظ الحالة. حاول مجددًا." };
    revalidatePath("/dashboard/classes");
    revalidatePath("/dashboard/attendance");
    revalidatePath("/dashboard");
    return { success: "تم." };
  } catch (error) {
    return { error: error instanceof ValidationError ? error.message : "تعذر حفظ الحالة حاليًا." };
  }
}
