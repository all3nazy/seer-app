"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { uuid } from "../../../../lib/operations";
import { paymentSettingsValues } from "../../../../lib/payments";
import { secretHash } from "../../../../lib/payment-gateways";

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

/** The gateway's webhook secret, pasted once. Only its hash is stored; nobody can read it back. */
export async function saveWebhookSecret(_: PaySettingsResult, data: FormData): Promise<PaySettingsResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const gateway = String(data.get("gateway") ?? "");
    if (!["moyasar", "hyperpay", "tap", "paytabs"].includes(gateway)) return { error: "اختر البوابة." };
    const secret = String(data.get("secret") ?? "").trim();
    const remove = data.get("remove") === "on";
    if (!remove && (secret.length < 16 || secret.length > 200)) return { error: "رمز الـWebhook من ١٦ إلى ٢٠٠ حرف. انسخه كما هو من لوحة البوابة." };
    const client = await createSupabaseServerClient();
    const { error } = await client.rpc("set_payment_webhook_secret", { org, gateway, secret_hash: remove ? null : secretHash(secret) });
    if (error) return { error: error.code === "42501" ? "لمالك المنشأة أو مديرها فقط." : "تعذر الحفظ." };
    revalidatePath("/dashboard/finance/online");
    return { success: remove ? "أُزيل الرمز. إشعارات البوابة لن تُقبل حتى تضيفه من جديد." : "حُفظ الرمز بشكل مشفّر. الدفعات المؤكدة من البوابة تنسجل الآن تلقائيًا." };
  } catch (error) { return { error: error instanceof Error ? error.message : "تعذر الحفظ." }; }
}
