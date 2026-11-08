"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { uuid, ValidationError } from "../../../lib/operations";
import { isIsoDate, riyadhToday } from "../../../lib/students";
import { leaveValues, staffAttendanceStatuses, staffValues } from "../../../lib/hr";

export type HrResult = { error?: string; success?: string };
const fail = (error: unknown, fallback: string): HrResult => ({ error: error instanceof ValidationError ? error.message : fallback });
const refresh = () => { revalidatePath("/dashboard/staff"); revalidatePath("/dashboard/my"); };
async function client() { return createSupabaseServerClient(); }

export async function saveStaff(_: HrResult, data: FormData): Promise<HrResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const values = staffValues(data);
    const id = data.get("staff_id");
    const db = await client();
    const { error } = id
      ? await db.from("staff_profiles").update(values).eq("organization_id", org).eq("id", uuid(id))
      : await db.from("staff_profiles").insert({ ...values, organization_id: org });
    if (error?.code === "23505") return { error: "هذا الحساب مربوط بموظف آخر." };
    if (error?.code === "42501") return { error: "ملفات الموظفين لمالك المنشأة أو مديرها." };
    if (error) return { error: "تعذر حفظ ملف الموظف." };
    refresh();
    return { success: id ? "حُفظت التعديلات." : "أُضيف الموظف." };
  } catch (error) { return fail(error, "تعذر الحفظ الآن."); }
}

export async function requestLeave(_: HrResult, data: FormData): Promise<HrResult> {
  try {
    const org = uuid(data.get("organization_id")), staff = uuid(data.get("staff_id"));
    const values = leaveValues(data);
    const db = await client();
    const { error } = await db.from("leave_requests").insert({ ...values, organization_id: org, staff_id: staff, status: data.get("approve") === "on" ? "approved" : "pending" });
    if (error?.code === "42501") return { error: "تقدر تطلب إجازة لنفسك فقط." };
    if (error) return { error: "تعذر إرسال الطلب." };
    refresh();
    return { success: data.get("approve") === "on" ? "سُجّلت الإجازة معتمدة." : "أُرسل طلب الإجازة للإدارة." };
  } catch (error) { return fail(error, "تعذر إرسال الطلب الآن."); }
}
export async function decideLeave(organizationId: string, id: string, status: "approved" | "rejected" | "cancelled"): Promise<HrResult> {
  try {
    const db = await client();
    const { data, error } = await db.from("leave_requests").update({ status }).eq("organization_id", uuid(organizationId)).eq("id", uuid(id)).select("id");
    if (error || !data?.length) return { error: status === "cancelled" ? "تقدر تلغي طلبك وهو بانتظار الموافقة فقط." : "القرار لمالك المنشأة أو مديرها." };
    refresh();
    return { success: status === "approved" ? "اعتُمدت الإجازة وتسجّلت في الحضور." : status === "rejected" ? "رُفض الطلب." : "أُلغي الطلب." };
  } catch { return { error: "تعذر التحديث." }; }
}

/** Self service: first press checks in, second press checks out. */
export async function checkInOut(organizationId: string, staffId: string): Promise<HrResult> {
  try {
    const org = uuid(organizationId), staff = uuid(staffId), day = riyadhToday();
    const db = await client();
    const { data: row } = await db.from("staff_attendance").select("id,check_in,check_out").eq("organization_id", org).eq("staff_id", staff).eq("work_date", day).maybeSingle();
    const { error } = row
      ? await db.from("staff_attendance").update({ check_out: new Date().toISOString() }).eq("id", row.id as string)
      : await db.from("staff_attendance").insert({ organization_id: org, staff_id: staff, work_date: day, status: "present", check_in: new Date().toISOString() });
    if (error?.code === "23514") return { error: "سجّلت انصرافك اليوم من قبل." };
    if (error) return { error: "تعذر التسجيل." };
    refresh();
    return { success: row ? "سُجّل انصرافك. يعطيك العافية!" : "سُجّل حضورك. يوم موفق!" };
  } catch { return { error: "تعذر التسجيل الآن." }; }
}
export async function markStaffAttendance(organizationId: string, staffId: string, day: string, status: string): Promise<HrResult> {
  try {
    if (!isIsoDate(day) || !staffAttendanceStatuses.includes(status as (typeof staffAttendanceStatuses)[number])) return { error: "قيمة غير صالحة." };
    const org = uuid(organizationId), staff = uuid(staffId);
    const db = await client();
    const { data: row } = await db.from("staff_attendance").select("id").eq("organization_id", org).eq("staff_id", staff).eq("work_date", day).maybeSingle();
    const { error } = row
      ? await db.from("staff_attendance").update({ status }).eq("id", row.id as string)
      : await db.from("staff_attendance").insert({ organization_id: org, staff_id: staff, work_date: day, status, check_in: status === "present" || status === "late" ? new Date().toISOString() : null });
    if (error) return { error: "تسجيل حضور الموظفين لمالك المنشأة أو مديرها." };
    refresh();
    return { success: "تم." };
  } catch { return { error: "تعذر التسجيل." }; }
}

export async function generatePayroll(organizationId: string, month: string): Promise<HrResult> {
  try {
    if (!/^\d{4}-\d{2}$/.test(month)) return { error: "اختر الشهر." };
    const db = await client();
    const { error } = await db.rpc("generate_payroll", { org: uuid(organizationId), month: `${month}-01` });
    if (error?.code === "23514") return { error: "رواتب هذا الشهر معتمدة ولا تتغير." };
    if (error) return { error: "الرواتب لمالك المنشأة أو مديرها." };
    revalidatePath("/dashboard/staff/payroll");
    return { success: "حُسبت الرواتب من ملفات الموظفين والإجازات والغياب." };
  } catch { return { error: "تعذر حساب الرواتب." }; }
}
export async function adjustPayrollLine(organizationId: string, lineId: string, bonus: number, deduction: number): Promise<HrResult> {
  try {
    if (![bonus, deduction].every(value => Number.isFinite(value) && value >= 0 && value < 1e8)) return { error: "مبلغ غير صالح." };
    const db = await client();
    const { error } = await db.from("payroll_lines").update({ bonus: Math.round(bonus * 100) / 100, other_deduction: Math.round(deduction * 100) / 100 }).eq("organization_id", uuid(organizationId)).eq("id", uuid(lineId));
    if (error) return { error: "الرواتب المعتمدة ما تتعدّل." };
    revalidatePath("/dashboard/staff/payroll");
    return { success: "تم." };
  } catch { return { error: "تعذر التعديل." }; }
}
export async function approvePayroll(organizationId: string, runId: string): Promise<HrResult> {
  try {
    const db = await client();
    const { error } = await db.from("payroll_runs").update({ status: "approved" }).eq("organization_id", uuid(organizationId)).eq("id", uuid(runId));
    if (error) return { error: "تعذر الاعتماد." };
    revalidatePath("/dashboard/staff/payroll");
    return { success: "اعتُمدت رواتب الشهر، وما عاد تتغير." };
  } catch { return { error: "تعذر الاعتماد." }; }
}
