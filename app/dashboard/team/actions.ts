"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { canManage, uuid, ValidationError } from "../../../lib/operations";
import { displayName, inviteValues, isRole } from "../../../lib/team";

export type TeamResult = { error?: string; success?: string };
// Final authority is PostgreSQL (RLS, guard_membership and the private invitation functions);
// these checks give clear messages before the database rejects anything.
async function session(org?: string) {
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { error: "انتهت الجلسة. سجّل الدخول مجددًا." } as const;
  if (!org) return { client, user, role: null } as const;
  const { data, error: memberError } = await client.from("memberships").select("role").eq("organization_id", org).eq("user_id", user.id).maybeSingle();
  if (memberError || !data) return { error: "لا تملك صلاحية على هذه المنشأة." } as const;
  return { client, user, role: data.role as string } as const;
}
function failure(error: unknown): TeamResult {
  return { error: error instanceof ValidationError ? error.message : "تعذر تنفيذ الطلب الآن. حاول مجددًا بعد قليل." };
}
function refresh() { revalidatePath("/dashboard/team"); revalidatePath("/dashboard/tasks"); revalidatePath("/dashboard/settings"); }

export async function inviteMember(data: FormData): Promise<TeamResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const values = inviteValues(data);
    const access = await session(org);
    if ("error" in access) return { error: access.error };
    if (!canManage(access.role ?? "")) return { error: "دعوة الأعضاء لمالك المنشأة أو مديرها." };
    if (access.role === "admin" && values.role !== "staff") return { error: "المدير يقدر يدعو موظفين فقط. دعوة المدراء للمالك." };
    const { error } = await access.client.rpc("invite_member", { org, invitee_email: values.email, invitee_role: values.role, invitee_name: values.name });
    if (error?.code === "23505") return { error: "هذا البريد عضو في المنشأة من قبل." };
    if (error) return { error: "تعذر إرسال الدعوة. تحقق من البريد وحاول مجددًا." };
    refresh();
    return { success: "تمت الدعوة" };
  } catch (error) { return failure(error); }
}
export async function revokeInvitation(organizationId: string, invitationId: string): Promise<TeamResult> {
  try {
    const access = await session(uuid(organizationId));
    if ("error" in access) return { error: access.error };
    const { error } = await access.client.rpc("revoke_member_invitation", { invitation: uuid(invitationId) });
    if (error) return { error: "تعذر إلغاء الدعوة. ربما استُخدمت أو أُلغيت من قبل." };
    refresh();
    return { success: "أُلغيت الدعوة" };
  } catch (error) { return failure(error); }
}
export async function updateMember(data: FormData): Promise<TeamResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const member = uuid(data.get("user_id"));
    const access = await session(org);
    if ("error" in access) return { error: access.error };
    const values: { display_name?: string | null; role?: string } = {};
    if (data.has("display_name")) values.display_name = displayName(data.get("display_name"));
    const role = data.get("role");
    if (role) {
      if (!isRole(role)) return { error: "الصلاحية غير صالحة." };
      if (member === access.user.id) return { error: "ما تقدر تغيّر صلاحيتك بنفسك." };
      if (access.role !== "owner") return { error: "تغيير الصلاحيات لمالك المنشأة فقط." };
      values.role = role;
    }
    const { data: row, error } = await access.client.from("memberships").update(values).eq("organization_id", org).eq("user_id", member).select("user_id").maybeSingle();
    if (error?.code === "23514") return { error: "لازم يبقى للمنشأة مالك واحد على الأقل." };
    if (error || !row) return { error: "تعذر الحفظ. تأكد من صلاحيتك وأعد تحميل الصفحة." };
    refresh();
    return { success: "حُفظ التغيير" };
  } catch (error) { return failure(error); }
}
export async function removeMember(organizationId: string, userId: string): Promise<TeamResult> {
  try {
    const org = uuid(organizationId);
    const member = uuid(userId);
    const access = await session(org);
    if ("error" in access) return { error: access.error };
    if (member === access.user.id) return { error: "ما تقدر تحذف نفسك من المنشأة." };
    const { data: row, error } = await access.client.from("memberships").delete().eq("organization_id", org).eq("user_id", member).select("user_id").maybeSingle();
    if (error?.code === "42501") return { error: "إزالة المدراء والمالكين لمالك المنشأة فقط." };
    if (error || !row) return { error: "تعذر إزالة العضو. تأكد من صلاحيتك." };
    refresh();
    return { success: "أُزيل العضو، ومهامه صارت بدون مسؤول" };
  } catch (error) { return failure(error); }
}
/** A person's own name, applied to all their memberships. */
export async function setMyName(data: FormData): Promise<TeamResult> {
  try {
    const name = displayName(data.get("display_name"), true);
    const access = await session();
    if ("error" in access) return { error: access.error };
    const { error } = await access.client.from("memberships").update({ display_name: name }).eq("user_id", access.user.id);
    if (error) return { error: "تعذر حفظ الاسم. حاول مجددًا." };
    refresh();
    revalidatePath("/dashboard");
    return { success: "حُفظ اسمك" };
  } catch (error) { return failure(error); }
}

/** Sets the signed-in member's phone in every organization they belong to; empty clears it. */
export async function setMyPhone(data: FormData): Promise<TeamResult> {
  try {
    const raw = data.get("phone");
    const phone = typeof raw === "string" ? raw.replace(/[\s-]/g, "") : "";
    if (phone && !/^\+?[0-9]{8,15}$/.test(phone)) return { error: "رقم الجوال من ٨ إلى ١٥ رقمًا، ويمكن أن يبدأ بعلامة +." };
    const access = await session();
    if ("error" in access) return { error: access.error };
    const { data: orgs, error: orgError } = await access.client.from("memberships").select("organization_id").eq("user_id", access.user.id);
    if (orgError) return { error: "تعذر حفظ الرقم. حاول مجددًا." };
    for (const { organization_id } of orgs ?? []) {
      const mine = access.client.from("member_phones");
      let error;
      if (!phone) ({ error } = await mine.delete().eq("organization_id", organization_id).eq("user_id", access.user.id));
      else {
        const { data: existing } = await mine.select("user_id").eq("organization_id", organization_id).eq("user_id", access.user.id).maybeSingle();
        ({ error } = existing
          ? await access.client.from("member_phones").update({ phone }).eq("organization_id", organization_id).eq("user_id", access.user.id)
          : await access.client.from("member_phones").insert({ organization_id, user_id: access.user.id, phone }));
      }
      if (error) return { error: "تعذر حفظ الرقم. حاول مجددًا." };
    }
    refresh();
    return { success: phone ? "حُفظ رقمك" : "حُذف رقمك" };
  } catch (error) { return failure(error); }
}
