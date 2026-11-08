"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, authUser } from "../../../lib/supabase/server";
import { canManage, uuid, ValidationError } from "../../../lib/operations";
import { financeValues, invoiceHeader, isFinanceTable, lineValues, paymentValues } from "../../../lib/finance";
import { isIsoDate } from "../../../lib/students";

export type FinanceResult = { error?: string; success?: string; id?: string };

async function managerClient(org: string) {
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await authUser(client);
  if (error || !user) return { error: "انتهت الجلسة. سجل الدخول مجددًا." } as const;
  const { data: member, error: memberError } = await client.from("memberships").select("role").eq("organization_id", org).eq("user_id", user.id).maybeSingle();
  if (memberError || !canManage(member?.role)) return { error: "المالية لمسؤول المنشأة فقط." } as const;
  return { client } as const;
}
const fail = (error: unknown, fallback: string): FinanceResult => ({ error: error instanceof ValidationError ? error.message : fallback });
const dbMessages: Record<string, string> = {
  "23505": "فيه سجل بنفس الاسم.",
  "23503": "السجل مرتبط بسجلات ثانية أو غير متاح في هذه المنشأة.",
  "23514": "العملية غير مسموحة بحالة الفاتورة الحالية أو المبلغ أكبر من المتبقي.",
  "42501": "الفاتورة الصادرة ما تتعدّل. ألغِها وأصدر وحدة جديدة.",
};
function refresh(invoice?: string) {
  revalidatePath("/dashboard/finance");
  if (invoice) revalidatePath(`/dashboard/finance/invoices/${invoice}`);
  revalidatePath("/dashboard");
}

export async function saveFinanceRecord(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const table = data.get("table");
    if (!isFinanceTable(table)) return { error: "قسم غير صالح." };
    const id = data.get("record_id");
    const values = financeValues(table, data, Boolean(id));
    const auth = await managerClient(org);
    if ("error" in auth) return { error: auth.error };
    const query = id ? auth.client.from(table).update(values).eq("id", uuid(id)).eq("organization_id", org) : auth.client.from(table).insert({ ...values, organization_id: org });
    const { data: record, error } = await query.select("id").maybeSingle();
    if (error) return { error: dbMessages[error.code ?? ""] ?? "تعذر الحفظ. أعد تحميل الصفحة." };
    if (!record) return { error: "تعذر الحفظ. أعد تحميل الصفحة." };
    refresh();
    return { success: id ? "حُفظت التعديلات." : "أُضيف." };
  } catch (error) { return fail(error, "تعذر الحفظ حاليًا."); }
}
export async function deleteFinanceRecord(organizationId: string, table: string, recordId: string): Promise<FinanceResult> {
  try {
    const org = uuid(organizationId);
    if (!isFinanceTable(table)) return { error: "قسم غير صالح." };
    const auth = await managerClient(org);
    if ("error" in auth) return { error: auth.error };
    const { data: record, error } = await auth.client.from(table).delete().eq("id", uuid(recordId)).eq("organization_id", org).select("id").maybeSingle();
    if (error?.code === "23503") return { error: "البند مستخدم في باقات. احذفه من الباقات أو عطّله بدل الحذف." };
    if (error || !record) return { error: "تعذر الحذف. أعد تحميل الصفحة." };
    refresh();
    return { success: "حُذف." };
  } catch (error) { return fail(error, "تعذر الحذف حاليًا."); }
}

export async function saveInvoice(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const values = invoiceHeader(data);
    const auth = await managerClient(org);
    if ("error" in auth) return { error: auth.error };
    const id = data.get("invoice_id");
    const query = id
      ? auth.client.from("invoices").update(values).eq("id", uuid(id)).eq("organization_id", org).eq("status", "draft")
      : auth.client.from("invoices").insert({ ...values, organization_id: org, amount_sar: 0, status: "draft" });
    const { data: record, error } = await query.select("id").maybeSingle();
    if (error) return { error: dbMessages[error.code ?? ""] ?? "تعذر حفظ الفاتورة." };
    if (!record) return { error: "الفاتورة الصادرة ما تتعدّل." };
    refresh(record.id);
    return { success: id ? "حُفظت الفاتورة." : "أُنشئت مسودة الفاتورة.", id: record.id };
  } catch (error) { return fail(error, "تعذر حفظ الفاتورة حاليًا."); }
}

export async function addInvoiceLine(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const invoice = uuid(data.get("invoice_id"));
    const values = lineValues(data);
    const auth = await managerClient(org);
    if ("error" in auth) return { error: auth.error };
    const { error } = await auth.client.from("invoice_lines").insert({ ...values, organization_id: org, invoice_id: invoice });
    if (error) return { error: dbMessages[error.code ?? ""] ?? "تعذر إضافة البند." };
    refresh(invoice);
    return { success: "أُضيف البند." };
  } catch (error) { return fail(error, "تعذر إضافة البند حاليًا."); }
}
export async function deleteInvoiceLine(organizationId: string, invoiceId: string, lineId: string): Promise<FinanceResult> {
  try {
    const org = uuid(organizationId);
    const auth = await managerClient(org);
    if ("error" in auth) return { error: auth.error };
    const { data: record, error } = await auth.client.from("invoice_lines").delete().eq("id", uuid(lineId)).eq("organization_id", org).select("id").maybeSingle();
    if (error || !record) return { error: error ? dbMessages[error.code ?? ""] ?? "تعذر حذف البند." : "تعذر حذف البند." };
    refresh(uuid(invoiceId));
    return { success: "حُذف البند." };
  } catch (error) { return fail(error, "تعذر الحذف حاليًا."); }
}

export async function setInvoiceStatus(organizationId: string, invoiceId: string, status: "issued" | "void"): Promise<FinanceResult> {
  try {
    const org = uuid(organizationId), invoice = uuid(invoiceId);
    const auth = await managerClient(org);
    if ("error" in auth) return { error: auth.error };
    const { data: record, error } = await auth.client.from("invoices").update({ status }).eq("id", invoice).eq("organization_id", org).select("id").maybeSingle();
    if (error?.code === "23514") return { error: status === "issued" ? "أضف بنودًا بمبلغ قبل إصدار الفاتورة." : "احذف المدفوعات قبل إلغاء الفاتورة." };
    if (error || !record) return { error: dbMessages[error?.code ?? ""] ?? "تعذر تغيير حالة الفاتورة." };
    refresh(invoice);
    return { success: status === "issued" ? "صدرت الفاتورة وأخذت رقمها." : "أُلغيت الفاتورة." };
  } catch (error) { return fail(error, "تعذر تغيير الحالة حاليًا."); }
}
export async function deleteDraftInvoice(organizationId: string, invoiceId: string): Promise<FinanceResult> {
  try {
    const org = uuid(organizationId);
    const auth = await managerClient(org);
    if ("error" in auth) return { error: auth.error };
    const { data: record, error } = await auth.client.from("invoices").delete().eq("id", uuid(invoiceId)).eq("organization_id", org).eq("status", "draft").select("id").maybeSingle();
    if (error || !record) return { error: "تنحذف المسودات فقط." };
    refresh();
    return { success: "حُذفت المسودة." };
  } catch (error) { return fail(error, "تعذر الحذف حاليًا."); }
}

export async function recordPayment(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const invoice = uuid(data.get("invoice_id"));
    const values = paymentValues(data);
    const auth = await managerClient(org);
    if ("error" in auth) return { error: auth.error };
    const { data: record, error } = await auth.client.from("payments").insert({ ...values, organization_id: org, invoice_id: invoice }).select("id,receipt_number").maybeSingle();
    if (error?.code === "23514") return { error: "المبلغ أكبر من المتبقي، أو الفاتورة غير صادرة." };
    if (error || !record) return { error: "تعذر تسجيل الدفعة. أعد تحميل الصفحة." };
    refresh(invoice);
    return { success: `سُجّلت الدفعة، إيصال رقم ${record.receipt_number}.`, id: record.id };
  } catch (error) { return fail(error, "تعذر تسجيل الدفعة حاليًا."); }
}
export async function deletePayment(organizationId: string, invoiceId: string, paymentId: string): Promise<FinanceResult> {
  try {
    const org = uuid(organizationId);
    const auth = await managerClient(org);
    if ("error" in auth) return { error: auth.error };
    const { data: record, error } = await auth.client.from("payments").delete().eq("id", uuid(paymentId)).eq("organization_id", org).select("id").maybeSingle();
    if (error || !record) return { error: "تنحذف الدفعة خلال يوم من تسجيلها فقط، لتصحيح الأخطاء." };
    refresh(uuid(invoiceId));
    return { success: "حُذفت الدفعة." };
  } catch (error) { return fail(error, "تعذر الحذف حاليًا."); }
}

export async function generateInvoices(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  try {
    const org = uuid(data.get("organization_id"));
    const plan = uuid(data.get("fee_plan_id"));
    const target = data.get("target");
    if (typeof target !== "string" || !/^(section|grade):/.test(target)) return { error: "اختر الصف أو الشعبة." };
    const [kind, id] = target.split(":");
    const first = data.get("first_due");
    if (!isIsoDate(first)) return { error: "أدخل تاريخ أول استحقاق." };
    const interval = Number(data.get("interval_months") ?? 1);
    if (!Number.isInteger(interval) || interval < 1 || interval > 6) return { error: "الفاصل بين الأقساط من ١ إلى ٦ أشهر." };
    const discount = data.get("discount_id");
    const auth = await managerClient(org);
    if ("error" in auth) return { error: auth.error };
    const { data: created, error } = await auth.client.rpc("generate_plan_invoices", {
      plan, target_section: kind === "section" ? uuid(id) : null, target_grade: kind === "grade" ? uuid(id) : null,
      first_due: first, interval_months: interval, discount: discount ? uuid(discount) : null, issue: data.get("issue") === "on",
    });
    if (error?.code === "23514") return { error: "الباقة ما فيها بنود. أضف بنودها أولًا." };
    if (error) return { error: "تعذر إنشاء الفواتير. تحقق من الاختيارات." };
    refresh();
    return { success: created ? `أُنشئت ${Number(created).toLocaleString("ar-SA")} فاتورة.` : "ما فيه طلاب في الاختيار." };
  } catch (error) { return fail(error, "تعذر إنشاء الفواتير حاليًا."); }
}
