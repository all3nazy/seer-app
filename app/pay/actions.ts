"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
/** From the family's invoice link: start paying the balance with the chosen method. */
export async function startPayment(token: string, method: string): Promise<{ error?: string }> {
  if (!isUuid(token)) return { error: "رابط غير صالح." };
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("start_online_payment", { token, method });
  if (error?.code === "54000") return { error: "محاولات كثيرة. حاول بعد ساعة." };
  if (error || !data) return { error: "الدفع الإلكتروني غير متاح لهذه الفاتورة حاليًا." };
  redirect(`/pay/${(data as { intent: string }).intent}?t=${token}`);
}
export async function finishSandbox(token: string, intent: string, succeed: boolean): Promise<{ error?: string }> {
  if (!isUuid(token) || !isUuid(intent)) return { error: "رابط غير صالح." };
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("finish_sandbox_payment", { token, intent, succeed });
  if (error) return { error: "تعذر إتمام العملية التجريبية." };
  redirect(`/pay/${intent}?t=${token}`);
}
