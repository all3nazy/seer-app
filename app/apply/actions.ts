"use server";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { uuid, ValidationError } from "../../lib/operations";
import { applicationPayload } from "../../lib/admissions";

export type ApplyResult = { error?: string; reference?: string };
export type StatusResult = { error?: string; status?: string; interview_at?: string | null; organization?: string };

export async function submitApplication(_: ApplyResult, data: FormData): Promise<ApplyResult> {
  try {
    // Honeypot: people never see or fill this field.
    if (data.get("website")) return { reference: "--------" };
    const org = uuid(data.get("organization_id"));
    const payload = applicationPayload(data);
    const client = await createSupabaseServerClient();
    const { data: reference, error } = await client.rpc("submit_application", { org, payload });
    if (error?.code === "42501") return { error: "التقديم مغلق حاليًا في هذه المنشأة." };
    if (error?.code === "54000") return { error: "وصل التقديم لحده اليومي. حاول بكرة." };
    if (error || typeof reference !== "string") return { error: "تعذر إرسال الطلب. تحقق من البيانات وحاول مجددًا." };
    return { reference };
  } catch (error) {
    return { error: error instanceof ValidationError ? error.message : "تعذر إرسال الطلب حاليًا. حاول لاحقًا." };
  }
}

export async function checkApplication(_: StatusResult, data: FormData): Promise<StatusResult> {
  const reference = data.get("reference"), phone = data.get("phone");
  if (typeof reference !== "string" || !/^[A-Za-z0-9]{8}$/.test(reference.trim())) return { error: "رقم الطلب ٨ حروف وأرقام." };
  if (typeof phone !== "string" || !/^\+?[0-9]{8,15}$/.test(phone.replace(/[\s-]/g, ""))) return { error: "اكتب رقم الجوال اللي قدّمت فيه." };
  const client = await createSupabaseServerClient();
  const { data: rows, error } = await client.rpc("application_status", { ref: reference.trim(), phone: phone.replace(/[\s-]/g, "") });
  if (error) return { error: "تعذر الاستعلام حاليًا. حاول لاحقًا." };
  const row = (rows as { status: string; interview_at: string | null; organization_name: string }[] | null)?.[0];
  if (!row) return { error: "ما لقينا طلب بهذا الرقم والجوال. تأكد منهم." };
  return { status: row.status, interview_at: row.interview_at, organization: row.organization_name };
}
