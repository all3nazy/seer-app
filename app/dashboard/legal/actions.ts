"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { LEGAL_VERSION } from "../../../lib/legal";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The owner accepts the current terms and privacy policy for their organization. */
export async function acceptLegal(organizationId: string): Promise<{ error?: string }> {
  if (!uuid.test(organizationId)) return { error: "طلب غير صالح." };
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("accept_legal", { org: organizationId, version: LEGAL_VERSION });
  if (error) return { error: error.code === "42501" ? "الموافقة من صلاحية مالك المنشأة." : "تعذر حفظ الموافقة. حاول مرة ثانية." };
  // The reply re-renders the dashboard without the consent screen; no second refresh is needed.
  revalidatePath("/dashboard", "layout");
  return {};
}
