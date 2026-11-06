export const entities = ["branches", "children", "guardians", "enrollments", "invoices"] as const;
export type Entity = (typeof entities)[number];
export type OrganizationType = "school" | "nursery" | "kindergarten";
export const entityLabels: Record<Entity, string> = {
  branches: "الفروع", children: "الأطفال", guardians: "أولياء الأمور", enrollments: "التسجيل", invoices: "الفواتير",
};
export const statusLabels: Record<string, string> = {
  pending: "بانتظار الموافقة", approved: "مقبول", rejected: "مرفوض", withdrawn: "منسحب",
  draft: "مسودة", issued: "صادرة", paid: "مسددة", void: "ملغاة",
};
export type OperationRecord = {
  id: string;
  name?: string;
  full_name?: string;
  date_of_birth?: string | null;
  phone?: string | null;
  child_id?: string;
  branch_id?: string | null;
  guardian_id?: string | null;
  status?: string;
  amount_sar?: number;
};
export type RecordOption = { id: string; name: string };
export class ValidationError extends Error {}

export function isEntity(value: string): value is Entity { return entities.some(entity => entity === value); }
export function canManage(role: string | undefined): boolean { return role === "owner" || role === "admin"; }
export function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ValidationError("معرّف السجل غير صالح. أعد تحميل الصفحة ثم حاول مجددًا.");
  }
  return value;
}
function text(data: FormData, key: string): string {
  const value = data.get(key);
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > 120) {
    throw new ValidationError("يرجى إدخال اسم من حرف واحد إلى ١٢٠ حرفًا.");
  }
  return value.trim();
}
function optionalId(data: FormData, key: string): string | null { const value = data.get(key); return value ? uuid(value) : null; }
function choice(data: FormData, key: string, allowed: readonly string[]): string {
  const value = data.get(key);
  if (typeof value !== "string" || !allowed.includes(value)) throw new ValidationError("القيمة المحددة غير صالحة.");
  return value;
}
export function organizationValues(data: FormData): { name: string; type: string } {
  return { name: text(data, "name"), type: choice(data, "type", ["school", "nursery", "kindergarten"]) };
}
export function operationValues(entity: Entity, data: FormData): Record<string, string | number | null> {
  switch (entity) {
    case "branches": return { name: text(data, "name") };
    case "children": {
      const date = data.get("date_of_birth");
      if (date && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > new Date().toISOString().slice(0, 10))) {
        throw new ValidationError("أدخل تاريخ ميلاد صحيحًا لا يتجاوز اليوم.");
      }
      return { full_name: text(data, "full_name"), date_of_birth: typeof date === "string" && date ? date : null };
    }
    case "guardians": {
      const phone = data.get("phone");
      if (phone && (typeof phone !== "string" || !/^\+?[0-9]{8,15}$/.test(phone))) throw new ValidationError("أدخل رقم هاتف من ٨ إلى ١٥ رقمًا؛ يمكن أن يبدأ بعلامة +.");
      return { full_name: text(data, "full_name"), phone: typeof phone === "string" && phone ? phone : null };
    }
    case "enrollments": return {
      child_id: uuid(data.get("child_id")), branch_id: optionalId(data, "branch_id"),
      status: choice(data, "status", ["pending", "approved", "rejected", "withdrawn"]),
    };
    case "invoices": {
      const raw = data.get("amount_sar");
      if (typeof raw !== "string" || !/^\d{1,10}(\.\d{1,2})?$/.test(raw)) throw new ValidationError("أدخل مبلغًا من صفر إلى ٩٬٩٩٩٬٩٩٩٬٩٩٩٫٩٩ ريال، بمنزلتين عشريتين كحد أقصى.");
      return { guardian_id: optionalId(data, "guardian_id"), amount_sar: Number(raw), status: choice(data, "status", ["draft", "issued", "paid", "void"]) };
    }
  }
}
