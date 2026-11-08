"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { uuid } from "../../../../lib/operations";
import { paymentSettingsValues } from "../../../../lib/payments";

export type PaySettingsResult = { error?: string; success?: string };
export async function savePaymentSettings(_: PaySettingsResult, data: FormData): Promise<PaySettingsResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const values = paymentSettingsValues(data);
    const client = await createSupabaseServerClient();
    const { data: existing } = await client.from("payment_settings").select("organization_id").eq("organization_id", org).maybeSingle();
    const { error } = existing
      ? await client.from("payment_settings").update(values).eq("organization_id", org)
      : await client.from("payment_settings").insert({ ...values, organization_id: org });
    if (error?.code === "42501") return { error: "إعدادات الدفع لمالك المنشأة أو مديرها." };
    if (error) return { error: "تعذر الحفظ. تحقق من القيم." };
    revalidatePath("/dashboard/finance/online");
    return { success: values.is_enabled ? "حُفظت الإعدادات، وصار زر «ادفع الآن» يظهر في روابط الفواتير." : "حُفظت الإعدادات (الدفع الإلكتروني متوقف)." };
  } catch (error) { return { error: error instanceof Error ? error.message : "تعذر الحفظ." }; }
}
