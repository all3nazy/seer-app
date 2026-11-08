"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { uuid } from "../../../lib/operations";
import { messageSettingsValues } from "../../../lib/messaging";

export type MsgResult = { error?: string; success?: string };
export async function saveMessageSettings(_: MsgResult, data: FormData): Promise<MsgResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const values = messageSettingsValues(data);
    const client = await createSupabaseServerClient();
    const { data: existing } = await client.from("message_settings").select("organization_id").eq("organization_id", org).maybeSingle();
    const { error } = existing ? await client.from("message_settings").update({ ...values, updated_at: undefined }).eq("organization_id", org)
      : await client.from("message_settings").insert({ ...values, organization_id: org });
    if (error) return { error: "إعدادات الرسائل لمالك المنشأة أو مديرها." };
    revalidatePath("/dashboard/messages");
    return { success: "حُفظت الإعدادات. الرسائل الجديدة تنضاف للصندوق تلقائيًا." };
  } catch (error) { return { error: error instanceof Error ? error.message : "تعذر الحفظ." }; }
}
export async function markMessage(id: string, status: "sent" | "skipped" | "queued"): Promise<MsgResult> {
  try {
    const client = await createSupabaseServerClient();
    const { error } = await client.rpc("mark_message", { message: uuid(id), new_status: status });
    if (error) return { error: "تعذر التحديث." };
    revalidatePath("/dashboard/messages");
    return { success: status === "sent" ? "تم." : status === "skipped" ? "تُجوهلت الرسالة." : "رجعت للانتظار." };
  } catch { return { error: "تعذر التحديث." }; }
}
