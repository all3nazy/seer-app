"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { canManage, uuid, ValidationError } from "../../../lib/operations";

export type PickupResult = { error?: string; success?: string };

async function memberClient(org: string, needManager = false) {
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { error: "انتهت الجلسة. سجل الدخول مجددًا." } as const;
  const { data: member, error: memberError } = await client.from("memberships").select("role").eq("organization_id", org).eq("user_id", user.id).maybeSingle();
  if (memberError || !member) return { error: "لا تملك صلاحية على هذه المنشأة." } as const;
  if (needManager && !canManage(member.role)) return { error: "قائمة المصرّح لهم يعدّلها مسؤول المنشأة فقط." } as const;
  return { client } as const;
}
const fail = (error: unknown, fallback: string): PickupResult => ({ error: error instanceof ValidationError ? error.message : fallback });

/** `person` is `guardian:<id>` or `authorized:<id>`. */
export async function recordPickup(organizationId: string, childId: string, person: string, note: string): Promise<PickupResult> {
  try {
    const org = uuid(organizationId), child = uuid(childId);
    const [kind, id] = person.split(":");
    if (kind !== "guardian" && kind !== "authorized") return { error: "اختر الشخص المستلم." };
    const trimmed = note.trim();
    if (trimmed.length > 200) return { error: "الملاحظة لا تتجاوز ٢٠٠ حرف." };
    const auth = await memberClient(org);
    if ("error" in auth) return { error: auth.error };
    const { error } = await auth.client.from("pickups").insert({
      organization_id: org, child_id: child, note: trimmed || null,
      ...(kind === "guardian" ? { guardian_id: uuid(id) } : { authorized_id: uuid(id) }),
    });
    if (error?.code === "23505") return { error: "الطالب تسلّم اليوم من قبل." };
    if (error?.code === "42501") return { error: "هذا الشخص غير مصرّح له باستلام الطالب." };
    if (error) return { error: "تعذر تسجيل التسليم. أعد تحميل الصفحة." };
    revalidatePath("/dashboard/pickup");
    return { success: "تم تسجيل التسليم." };
  } catch (error) { return fail(error, "تعذر تسجيل التسليم حاليًا."); }
}
export async function undoPickup(organizationId: string, pickupId: string): Promise<PickupResult> {
  try {
    const org = uuid(organizationId);
    const auth = await memberClient(org);
    if ("error" in auth) return { error: auth.error };
    const { data, error } = await auth.client.from("pickups").delete().eq("id", uuid(pickupId)).eq("organization_id", org).select("id").maybeSingle();
    if (error || !data) return { error: "التراجع متاح لمن سجّل التسليم خلال ١٥ دقيقة، أو لمسؤول المنشأة." };
    revalidatePath("/dashboard/pickup");
    return { success: "تم التراجع عن التسليم." };
  } catch (error) { return fail(error, "تعذر التراجع حاليًا."); }
}

export async function saveAuthorizedPickup(_: PickupResult, data: FormData): Promise<PickupResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const child = uuid(data.get("child_id"));
    const name = data.get("full_name"), relationship = data.get("relationship");
    if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 120) return { error: "اكتب اسم الشخص." };
    if (typeof relationship !== "string" || relationship.trim().length < 1 || relationship.trim().length > 40) return { error: "اكتب صلته بالطالب، مثل: جد، خال، سائق." };
    const phone = typeof data.get("phone") === "string" ? (data.get("phone") as string).replace(/[\s-]/g, "") : "";
    if (phone && !/^\+?[0-9]{8,15}$/.test(phone)) return { error: "رقم الجوال من ٨ إلى ١٥ رقمًا." };
    const nationalId = typeof data.get("national_id") === "string" ? (data.get("national_id") as string).trim() : "";
    if (nationalId && !/^[0-9]{10}$/.test(nationalId)) return { error: "رقم الهوية ١٠ أرقام." };
    const auth = await memberClient(org, true);
    if ("error" in auth) return { error: auth.error };
    const { error } = await auth.client.from("authorized_pickups").insert({ organization_id: org, child_id: child, full_name: name.trim(), relationship: relationship.trim(), phone: phone || null, national_id: nationalId || null });
    if (error) return { error: "تعذر الإضافة. أعد تحميل الصفحة." };
    revalidatePath(`/dashboard/children/${child}`);
    revalidatePath("/dashboard/pickup");
    return { success: "أُضيف المصرّح له." };
  } catch (error) { return fail(error, "تعذر الإضافة حاليًا."); }
}
export async function setAuthorizedActive(organizationId: string, childId: string, id: string, active: boolean): Promise<PickupResult> {
  try {
    const org = uuid(organizationId);
    const auth = await memberClient(org, true);
    if ("error" in auth) return { error: auth.error };
    const { data, error } = await auth.client.from("authorized_pickups").update({ is_active: active }).eq("id", uuid(id)).eq("organization_id", org).select("id").maybeSingle();
    if (error || !data) return { error: "تعذر التحديث. أعد تحميل الصفحة." };
    revalidatePath(`/dashboard/children/${uuid(childId)}`);
    revalidatePath("/dashboard/pickup");
    return { success: active ? "تفعّل التصريح." : "أُوقف التصريح." };
  } catch (error) { return fail(error, "تعذر التحديث حاليًا."); }
}
