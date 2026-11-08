"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, authUser } from "../../../../lib/supabase/server";
import { canManage, uuid } from "../../../../lib/operations";
import { checkRow, findSection, normaliseRow, type ImportRow } from "../../../../lib/import";

export type ImportResult = { error?: string; created?: number; guardians?: number; skipped?: { line: number; reason: string }[] };
/**
 * Saves checked rows: each student, their guardian (reused when the phone or ID is already on file)
 * and the link between them. Rows with problems are skipped and reported; nothing is overwritten.
 */
export async function importStudents(organizationId: string, rows: { line: number; values: ImportRow }[]): Promise<ImportResult> {
  try {
    const org = uuid(organizationId);
    if (!Array.isArray(rows) || !rows.length) return { error: "ما فيه صفوف للاستيراد." };
    if (rows.length > 1000) return { error: "الحد ١٠٠٠ طالب في المرة الواحدة." };
    const client = await createSupabaseServerClient();
    const { data: { user } } = await authUser(client);
    if (!user) return { error: "انتهت الجلسة. سجّل الدخول مجددًا." };
    const { data: member } = await client.from("memberships").select("role").eq("organization_id", org).eq("user_id", user.id).maybeSingle();
    if (!member || !canManage(member.role as string)) return { error: "الاستيراد لمالك المنشأة أو مديرها." };
    const [sectionsResult, gradesResult, guardiansResult, kidsResult] = await Promise.all([
      client.from("sections").select("id,name,grade_level_id").eq("organization_id", org),
      client.from("grade_levels").select("id,name").eq("organization_id", org),
      client.from("guardians").select("id,phone,national_id").eq("organization_id", org).limit(5000),
      client.from("children").select("full_name,national_id").eq("organization_id", org).limit(10000),
    ]);
    const gradeName = new Map(((gradesResult.data ?? []) as { id: string; name: string }[]).map(row => [row.id, row.name]));
    const sections = ((sectionsResult.data ?? []) as { id: string; name: string; grade_level_id: string }[]).flatMap(row => [
      { id: row.id, name: `${gradeName.get(row.grade_level_id) ?? ""} — ${row.name}` }, { id: row.id, name: row.name },
    ]);
    const byPhone = new Map<string, string>(), byId = new Map<string, string>();
    for (const g of (guardiansResult.data ?? []) as { id: string; phone: string | null; national_id: string | null }[]) { if (g.phone) byPhone.set(g.phone, g.id); if (g.national_id) byId.set(g.national_id, g.id); }
    const existingIds = new Set(((kidsResult.data ?? []) as { national_id: string | null }[]).map(row => row.national_id).filter(Boolean));
    const skipped: { line: number; reason: string }[] = [];
    let created = 0, guardiansCreated = 0;
    for (const { line, values: raw } of rows) {
      const values = normaliseRow(raw);
      const problems = checkRow(values, sections.map(section => section.name));
      if (problems.length) { skipped.push({ line, reason: problems.join("، ") }); continue; }
      if (values.national_id && existingIds.has(values.national_id)) { skipped.push({ line, reason: "الطالب مسجّل من قبل (نفس رقم الهوية)" }); continue; }
      const section = findSection(values.section, sections);
      const { data: child, error } = await client.from("children").insert({
        organization_id: org, full_name: values.full_name, date_of_birth: values.date_of_birth || null, gender: values.gender || null,
        national_id: values.national_id || null, section_id: section?.id ?? null,
      }).select("id").single();
      if (error || !child) { skipped.push({ line, reason: "تعذر حفظ الطالب" }); continue; }
      created += 1;
      if (values.national_id) existingIds.add(values.national_id);
      if (!values.guardian_name) continue;
      let guardian = (values.guardian_phone && byPhone.get(values.guardian_phone)) || (values.guardian_national_id && byId.get(values.guardian_national_id)) || null;
      if (!guardian) {
        const { data: g } = await client.from("guardians").insert({ organization_id: org, full_name: values.guardian_name, phone: values.guardian_phone || null, national_id: values.guardian_national_id || null }).select("id").single();
        if (!g) { skipped.push({ line, reason: "حُفظ الطالب، وتعذر حفظ ولي الأمر" }); continue; }
        guardian = g.id as string; guardiansCreated += 1;
        if (values.guardian_phone) byPhone.set(values.guardian_phone, guardian);
        if (values.guardian_national_id) byId.set(values.guardian_national_id, guardian);
      }
      await client.from("child_guardians").insert({ organization_id: org, child_id: child.id, guardian_id: guardian, relationship: values.relationship || "guardian" });
    }
    revalidatePath("/dashboard/children");
    return { created, guardians: guardiansCreated, skipped };
  } catch { return { error: "تعذر الاستيراد الآن. حاول مجددًا." }; }
}
