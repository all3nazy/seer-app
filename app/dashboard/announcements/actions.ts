"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { uuid, ValidationError } from "../../../lib/operations";
import { audiences } from "../../../lib/family";
import { siteOrigin } from "../../../lib/origin";

export type NoticeResult = { error?: string; success?: string; link?: string };

export async function saveAnnouncement(_: NoticeResult, data: FormData): Promise<NoticeResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const title = String(data.get("title") ?? "").trim(), body = String(data.get("body") ?? "").trim();
    if (!title || title.length > 120) return { error: "اكتب عنوانًا حتى ١٢٠ حرفًا." };
    if (!body || body.length > 2000) return { error: "اكتب نص الإعلان حتى ٢٠٠٠ حرف." };
    const audience = String(data.get("audience") ?? "all");
    if (!audiences.includes(audience as (typeof audiences)[number])) return { error: "اختر الفئة." };
    const section = data.get("section_id") ? uuid(data.get("section_id")) : null;
    const client = await createSupabaseServerClient();
    const { error } = await client.from("announcements").insert({ organization_id: org, title, body, audience, section_id: section, pinned: data.get("pinned") === "on" });
    if (error?.code === "42501") return { error: "نشر الإعلانات لمالك المنشأة أو مديرها." };
    if (error) return { error: "تعذر نشر الإعلان." };
    revalidatePath("/dashboard/announcements");
    revalidatePath("/dashboard");
    return { success: "نُشر الإعلان." };
  } catch (error) { return { error: error instanceof ValidationError ? error.message : "تعذر نشر الإعلان الآن." }; }
}
export async function deleteAnnouncement(organizationId: string, id: string): Promise<NoticeResult> {
  try {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.from("announcements").delete().eq("organization_id", uuid(organizationId)).eq("id", uuid(id)).select("id");
    if (error || !data?.length) return { error: "الحذف لمالك المنشأة أو مديرها." };
    revalidatePath("/dashboard/announcements");
    return { success: "حُذف الإعلان." };
  } catch { return { error: "تعذر الحذف." }; }
}
/** The guardian's private portal link (created on first use). Managers only, checked in the database. */
export async function guardianPortalLink(guardianId: string, renew = false): Promise<NoticeResult> {
  try {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.rpc("guardian_portal_token", { guardian: uuid(guardianId), renew });
    if (error || !data) return { error: "رابط البوابة لمالك المنشأة أو مديرها." };
    return { link: `${await siteOrigin()}/p/${data as string}`, success: renew ? "تجدّد الرابط، والقديم ما عاد يفتح." : undefined };
  } catch { return { error: "تعذر إنشاء الرابط." }; }
}
