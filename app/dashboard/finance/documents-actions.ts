"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, authUser } from "../../../lib/supabase/server";
import { canManage, uuid, ValidationError } from "../../../lib/operations";
import { isIsoDate } from "../../../lib/students";
import { lineValues } from "../../../lib/finance";
import { profileValues, quoteLines, type QuoteStatus } from "../../../lib/documents";
import type { FeeKind } from "../../../lib/finance";

export type DocResult = { error?: string; success?: string };

/** Every action re-checks the session and that the caller manages the organization; RLS and the
 *  database guards apply the same rules again. */
async function manager(organizationId: unknown) {
  const org = uuid(organizationId);
  const client = await createSupabaseServerClient();
  const { data: { user } } = await authUser(client);
  if (!user) return { error: "انتهت الجلسة. سجّل الدخول مجددًا." } as const;
  const { data } = await client.from("memberships").select("role").eq("organization_id", org).eq("user_id", user.id).maybeSingle();
  if (!data || !canManage(data.role as string)) return { error: "المالية لمالك المنشأة أو مديرها." } as const;
  return { client, org } as const;
}
const fail = (error: unknown, fallback: string): DocResult => ({ error: error instanceof ValidationError ? error.message : fallback });
const refreshQuotes = (id?: string) => { revalidatePath("/dashboard/finance/quotes"); if (id) revalidatePath(`/dashboard/finance/quotes/${id}`); };

export async function saveProfile(_: DocResult, data: FormData): Promise<DocResult> {
  try {
    const auth = await manager(data.get("organization_id"));
    if ("error" in auth) return { error: auth.error };
    const values = profileValues(data);
    const { data: existing } = await auth.client.from("organization_profiles").select("id").eq("organization_id", auth.org).maybeSingle();
    const { error } = existing
      ? await auth.client.from("organization_profiles").update(values).eq("organization_id", auth.org)
      : await auth.client.from("organization_profiles").insert({ ...values, organization_id: auth.org });
    if (error?.code === "23514") return { error: "تحقق من صحة الحقول (السجل، الرقم الضريبي، الآيبان، الشعار)." };
    if (error) return { error: "تعذر حفظ الهوية. حاول مجددًا." };
    revalidatePath("/dashboard/finance/branding");
    return { success: "حُفظت هوية المستندات، وتظهر الحين على كل فاتورة وعرض سعر." };
  } catch (error) { return fail(error, "تعذر حفظ الهوية الآن."); }
}

/** A new quote from catalogue items (with chosen amounts) and an optional discount. */
export async function createQuote(_: DocResult, data: FormData): Promise<DocResult> {
  let id: string | null = null;
  try {
    const auth = await manager(data.get("organization_id"));
    if ("error" in auth) return { error: auth.error };
    const title = String(data.get("title") ?? "").trim();
    if (title.length < 1 || title.length > 120) return { error: "اكتب عنوان العرض." };
    const guardian = data.get("guardian_id") ? uuid(data.get("guardian_id")) : null;
    const child = data.get("child_id") ? uuid(data.get("child_id")) : null;
    const recipientName = String(data.get("recipient_name") ?? "").trim() || null;
    const recipientPhone = String(data.get("recipient_phone") ?? "").replace(/[\s-]/g, "") || null;
    if (!guardian && !recipientName) return { error: "اختر ولي أمر أو اكتب اسم المستلم." };
    if (recipientName && recipientName.length > 120) return { error: "اسم المستلم طويل." };
    if (recipientPhone && !/^\+?\d{8,15}$/.test(recipientPhone)) return { error: "رقم جوال المستلم غير صحيح." };
    const valid = data.get("valid_until");
    if (valid && !isIsoDate(valid)) return { error: "تاريخ الصلاحية غير صحيح." };
    const itemIds = data.getAll("item").map(value => uuid(value));
    if (!itemIds.length) return { error: "اختر بندًا واحدًا على الأقل من الرسوم." };
    const { data: items, error: itemsError } = await auth.client.from("fee_items").select("id,name,kind,default_amount,vat_rate").eq("organization_id", auth.org).in("id", itemIds);
    if (itemsError || !items?.length) return { error: "تعذر قراءة بنود الرسوم." };
    const chosen = itemIds.map(itemId => items.find(row => row.id === itemId)).filter(Boolean).map(row => {
      const raw = String(data.get(`amount:${row!.id}`) ?? row!.default_amount).trim();
      if (!/^\d{1,10}(\.\d{1,2})?$/.test(raw)) throw new ValidationError(`مبلغ «${row!.name}» غير صحيح.`);
      const qty = Number(data.get(`qty:${row!.id}`) ?? 1);
      if (!Number.isFinite(qty) || qty <= 0 || qty > 1000) throw new ValidationError(`كمية «${row!.name}» غير صحيحة.`);
      return { id: row!.id as string, name: row!.name as string, kind: row!.kind as FeeKind, amount: Number(raw), vat_rate: Number(row!.vat_rate), quantity: qty };
    });
    let discount: { kind: "percent" | "fixed"; value: number } | null = null;
    if (data.get("discount_id")) {
      const { data: row } = await auth.client.from("discounts").select("kind,value").eq("organization_id", auth.org).eq("id", uuid(data.get("discount_id"))).eq("is_active", true).maybeSingle();
      if (!row) return { error: "الخصم المختار غير متاح." };
      discount = { kind: row.kind as "percent" | "fixed", value: Number(row.value) };
    }
    const { data: quote, error } = await auth.client.from("quotes").insert({
      organization_id: auth.org, guardian_id: guardian, child_id: child, recipient_name: guardian ? null : recipientName, recipient_phone: guardian ? null : recipientPhone,
      title, valid_until: typeof valid === "string" && valid ? valid : null, notes: String(data.get("notes") ?? "").trim().slice(0, 1000) || null,
      vat_borne_by_state: data.get("vat_borne_by_state") === "on",
    }).select("id").single();
    if (error || !quote) return { error: "تعذر إنشاء العرض. حاول مجددًا." };
    id = quote.id as string;
    const { error: linesError } = await auth.client.from("quote_lines").insert(quoteLines(chosen, discount).map(line => ({ ...line, organization_id: auth.org, quote_id: id })));
    if (linesError) return { error: "أُنشئ العرض لكن تعذر إضافة البنود. افتحه وأضفها." };
    refreshQuotes();
  } catch (error) { return fail(error, "تعذر إنشاء العرض الآن."); }
  redirect(`/dashboard/finance/quotes/${id}?org=${encodeURIComponent(String(data.get("organization_id")))}`);
}

export async function addQuoteLine(_: DocResult, data: FormData): Promise<DocResult> {
  try {
    const auth = await manager(data.get("organization_id"));
    if ("error" in auth) return { error: auth.error };
    const quote = uuid(data.get("quote_id"));
    const { error } = await auth.client.from("quote_lines").insert({ ...lineValues(data), organization_id: auth.org, quote_id: quote });
    if (error?.code === "42501") return { error: "البنود تتعدّل في المسودة فقط." };
    if (error) return { error: "تعذر إضافة البند." };
    refreshQuotes(quote);
    return { success: "أُضيف البند." };
  } catch (error) { return fail(error, "تعذر إضافة البند الآن."); }
}
export async function deleteQuoteLine(organizationId: string, quoteId: string, lineId: string): Promise<DocResult> {
  try {
    const auth = await manager(organizationId);
    if ("error" in auth) return { error: auth.error };
    const { error } = await auth.client.from("quote_lines").delete().eq("organization_id", auth.org).eq("quote_id", uuid(quoteId)).eq("id", uuid(lineId));
    if (error) return { error: "البنود تتعدّل في المسودة فقط." };
    refreshQuotes(quoteId);
    return { success: "حُذف البند." };
  } catch (error) { return fail(error, "تعذر حذف البند."); }
}

const statusMessages: Partial<Record<QuoteStatus, string>> = { sent: "صار العرض جاهزًا للمشاركة وأخذ رقمه.", accepted: "سُجّل قبول العرض.", rejected: "سُجّل رفض العرض.", draft: "رجع العرض مسودة للتعديل." };
export async function setQuoteStatus(organizationId: string, quoteId: string, status: QuoteStatus): Promise<DocResult> {
  try {
    const auth = await manager(organizationId);
    if ("error" in auth) return { error: auth.error };
    if (!["sent", "accepted", "rejected", "draft"].includes(status)) return { error: "حالة غير صالحة." };
    const { error } = await auth.client.from("quotes").update({ status }).eq("organization_id", auth.org).eq("id", uuid(quoteId));
    if (error?.code === "23514") return { error: "أضف بنودًا بمبلغ قبل الإرسال." };
    if (error) return { error: "هذا التغيير غير مسموح لحالة العرض الحالية." };
    refreshQuotes(quoteId);
    return { success: statusMessages[status] };
  } catch (error) { return fail(error, "تعذر تحديث العرض."); }
}
export async function deleteQuote(organizationId: string, quoteId: string): Promise<DocResult> {
  try {
    const auth = await manager(organizationId);
    if ("error" in auth) return { error: auth.error };
    const { data, error } = await auth.client.from("quotes").delete().eq("organization_id", auth.org).eq("id", uuid(quoteId)).select("id");
    if (error || !data?.length) return { error: "تُحذف المسودات فقط." };
    refreshQuotes();
  } catch (error) { return fail(error, "تعذر حذف العرض."); }
  redirect(`/dashboard/finance/quotes?org=${encodeURIComponent(organizationId)}`);
}
export async function convertQuote(organizationId: string, quoteId: string, issue: boolean): Promise<DocResult & { invoiceId?: string }> {
  try {
    const auth = await manager(organizationId);
    if ("error" in auth) return { error: auth.error };
    const { data, error } = await auth.client.rpc("quote_to_invoice", { quote: uuid(quoteId), issue });
    if (error?.message?.includes("guardian or a student")) return { error: "اربط العرض بولي أمر أو طالب قبل تحويله لفاتورة." };
    if (error) return { error: "تعذر التحويل. أرسل العرض أولًا." };
    refreshQuotes(quoteId);
    revalidatePath("/dashboard/finance");
    return { success: issue ? "تحوّل العرض إلى فاتورة صادرة." : "تحوّل العرض إلى فاتورة مسودة.", invoiceId: data as string };
  } catch (error) { return fail(error, "تعذر التحويل الآن."); }
}
export async function renewShareLink(organizationId: string, kind: "invoice" | "quote", id: string): Promise<DocResult> {
  try {
    const auth = await manager(organizationId);
    if ("error" in auth) return { error: auth.error };
    const { error } = await auth.client.rpc("renew_share_token", { doc_kind: kind, doc: uuid(id) });
    if (error) return { error: "تعذر تجديد الرابط." };
    revalidatePath(kind === "quote" ? `/dashboard/finance/quotes/${id}` : `/dashboard/finance/invoices/${id}`);
    return { success: "تجدّد الرابط، والرابط القديم ما عاد يفتح." };
  } catch (error) { return fail(error, "تعذر تجديد الرابط."); }
}
