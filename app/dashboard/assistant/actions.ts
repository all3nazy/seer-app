"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { canManage, uuid, ValidationError } from "../../../lib/operations";
import { dueDate, nameSearchPattern, rankMatches } from "../../../lib/bot-commands";
import { attendanceLabels, isAttendanceStatus, riyadhToday, type AttendanceStatus } from "../../../lib/students";
import { markAttendance } from "../classes/actions";

/**
 * What the bot can look up and do. Every call runs as the signed-in person under RLS, so the bot
 * never sees or changes more than that person could in the app; writes go through the same
 * database guards and audit triggers as the regular pages.
 */
export type BotStudent = { id: string; full_name: string; section: string | null };
export type BotResult<T = undefined> = { error?: string; data?: T };

async function access(organizationId: string) {
  const org = uuid(organizationId);
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: "انتهت الجلسة. سجّل الدخول مجددًا." } as const;
  const { data: member } = await client.from("memberships").select("role").eq("organization_id", org).eq("user_id", user.id).maybeSingle();
  if (!member) return { error: "لا تملك صلاحية على هذه المنشأة." } as const;
  return { client, org, manager: canManage(member.role as string) } as const;
}
const fail = (error: unknown, fallback: string) => ({ error: error instanceof ValidationError ? error.message : fallback });

type SectionJoin = { name: string; grade_levels: { name: string } | null } | null;
const sectionName = (section: SectionJoin) => section ? [section.grade_levels?.name, section.name].filter(Boolean).join(" — ") : null;

export async function botFindStudents(organizationId: string, name: string): Promise<BotResult<BotStudent[]>> {
  try {
    const auth = await access(organizationId);
    if ("error" in auth) return { error: auth.error };
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 60) return { error: "اكتب اسم الطالب (حرفين على الأقل)." };
    const { data, error } = await auth.client.from("children").select("id,full_name,sections(name,grade_levels(name))")
      .eq("organization_id", auth.org).ilike("full_name", nameSearchPattern(trimmed)).limit(12);
    if (error) return { error: "تعذر البحث الآن. حاول مجددًا." };
    const rows = (data ?? []).map(row => ({ id: row.id as string, full_name: row.full_name as string, section: sectionName(row.sections as unknown as SectionJoin) }));
    return { data: rankMatches(trimmed, rows).slice(0, 6) };
  } catch (error) { return fail(error, "تعذر البحث الآن."); }
}

export type TodaySummary = { counts: Record<AttendanceStatus | "pending", number>; names: { id: string; full_name: string; section: string | null; at: string | null }[]; total: number };
/** Today's attendance in the organization; names only for the status asked about (up to 25). */
export async function botToday(organizationId: string, status: AttendanceStatus | "pending" | null): Promise<BotResult<TodaySummary>> {
  try {
    const auth = await access(organizationId);
    if ("error" in auth) return { error: auth.error };
    const today = riyadhToday();
    const [summary, enrolled] = await Promise.all([
      auth.client.rpc("section_attendance_summary", { org: auth.org, from_day: today, to_day: today }),
      auth.client.from("children").select("id", { count: "exact", head: true }).eq("organization_id", auth.org),
    ]);
    if (summary.error || enrolled.error) return { error: "تعذر قراءة الحضور الآن." };
    const counts = { present: 0, late: 0, absent: 0, excused: 0, pending: 0 };
    for (const row of (summary.data ?? []) as { status: string; total: number }[]) if (isAttendanceStatus(row.status)) counts[row.status] += Number(row.total);
    const total = enrolled.count ?? 0;
    counts.pending = Math.max(total - counts.present - counts.late - counts.absent - counts.excused, 0);
    let names: TodaySummary["names"] = [];
    if (status && status !== "pending") {
      const { data } = await auth.client.from("attendance").select("recorded_at,children(id,full_name,sections(name,grade_levels(name)))")
        .eq("organization_id", auth.org).eq("attendance_date", today).eq("status", status).order("recorded_at").limit(25);
      names = (data ?? []).map(row => {
        const child = row.children as unknown as { id: string; full_name: string; sections: SectionJoin } | null;
        return { id: child?.id ?? "", full_name: child?.full_name ?? "طالب", section: sectionName(child?.sections ?? null), at: row.recorded_at as string };
      });
    } else if (status === "pending" && counts.pending) {
      const { data: recorded } = await auth.client.from("attendance").select("child_id").eq("organization_id", auth.org).eq("attendance_date", today).limit(1000);
      const done = new Set((recorded ?? []).map(row => row.child_id as string));
      const { data } = await auth.client.from("children").select("id,full_name,sections(name,grade_levels(name))").eq("organization_id", auth.org).order("full_name").limit(1000);
      names = (data ?? []).filter(row => !done.has(row.id as string)).slice(0, 25)
        .map(row => ({ id: row.id as string, full_name: row.full_name as string, section: sectionName(row.sections as unknown as SectionJoin), at: null }));
    }
    return { data: { counts, names, total } };
  } catch (error) { return fail(error, "تعذر قراءة الحضور الآن."); }
}

export async function botFindSections(organizationId: string, name: string | null): Promise<BotResult<{ id: string; name: string }[]>> {
  try {
    const auth = await access(organizationId);
    if ("error" in auth) return { error: auth.error };
    let query = auth.client.from("sections").select("id,name,grade_levels(name)").eq("organization_id", auth.org).limit(8);
    if (name) query = query.ilike("name", nameSearchPattern(name.replace(/\s*\/\s*/g, "/")));
    const { data, error } = await query;
    if (error) return { error: "تعذر قراءة الفصول." };
    return { data: (data ?? []).map(row => ({ id: row.id as string, name: [((row.grade_levels as unknown as { name: string } | null)?.name), row.name as string].filter(Boolean).join(" — ") })) };
  } catch (error) { return fail(error, "تعذر قراءة الفصول."); }
}

/** Runs only after the person pressed «تأكيد» on the bot's proposal. */
export async function botSetAttendance(organizationId: string, childId: string, status: string): Promise<BotResult<string>> {
  if (!isAttendanceStatus(status)) return { error: "حالة غير صالحة." };
  const result = await markAttendance(organizationId, childId, status);
  return result.error ? { error: result.error } : { data: `تم: ${attendanceLabels[status]}. انحفظ باسمك ووقته في سجل المنصة.` };
}

export async function botCreateTask(organizationId: string, title: string, due: "today" | "tomorrow" | null): Promise<BotResult<string>> {
  try {
    const auth = await access(organizationId);
    if ("error" in auth) return { error: auth.error };
    if (!auth.manager) return { error: "إضافة المهام لمالك المنشأة أو مديرها." };
    const clean = title.trim();
    if (clean.length < 2 || clean.length > 120) return { error: "عنوان المهمة من حرفين إلى ١٢٠ حرفًا." };
    const { error } = await auth.client.from("tasks").insert({ organization_id: auth.org, title: clean, due_date: dueDate(due, riyadhToday()), priority: "normal" });
    if (error) return { error: "تعذر إضافة المهمة. حاول مجددًا." };
    revalidatePath("/dashboard/tasks");
    revalidatePath("/dashboard");
    return { data: "أُضيفت المهمة إلى لوحة المهام، وانحفظت في سجل التدقيق." };
  } catch (error) { return fail(error, "تعذر إضافة المهمة الآن."); }
}
