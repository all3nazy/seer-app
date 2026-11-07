import { isIsoDate } from "./students";

export const auditEntityLabels: Record<string, string> = {
  organizations: "المنشأة", branches: "الفروع", children: "الطلاب", guardians: "أولياء الأمور", enrollments: "التسجيل",
  invoices: "الفواتير", tasks: "المهام", memberships: "الفريق", member_invitations: "دعوات الفريق",
  child_guardians: "روابط أولياء الأمور", child_health: "الملف الصحي", attendance: "الحضور",
  academic_years: "السنوات الدراسية", academic_terms: "الفصول الدراسية", holidays: "الإجازات", grade_levels: "الصفوف", sections: "الشُعب", section_staff: "كادر الشُعب", applications: "طلبات الالتحاق", admission_settings: "إعدادات القبول",
  fee_items: "بنود الرسوم", fee_plans: "الباقات", fee_plan_items: "بنود الباقات", discounts: "الخصومات", invoice_lines: "بنود الفواتير", payments: "المدفوعات",
};
export const auditActionLabels: Record<string, string> = { INSERT: "إضافة", UPDATE: "تعديل", DELETE: "حذف" };
export type AuditEvent = { id: number; actor_id: string | null; entity: string; record_id: string; action: string; created_at: string };
export type AuditFilters = { entity?: string; action?: string; actor?: string; from?: string; to?: string };

export function auditFilters(params: Record<string, string | undefined>): AuditFilters {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return {
    entity: params.entity && params.entity in auditEntityLabels ? params.entity : undefined,
    action: params.action && params.action in auditActionLabels ? params.action : undefined,
    actor: params.actor && uuid.test(params.actor) ? params.actor : undefined,
    from: isIsoDate(params.from) ? params.from : undefined,
    to: isIsoDate(params.to) ? params.to : undefined,
  };
}
/** Riyadh day boundaries as UTC instants, so a filter by date matches what people see. */
export function riyadhDayStart(day: string): string { return new Date(Date.parse(`${day}T00:00:00+03:00`)).toISOString(); }
export function riyadhDayEnd(day: string): string { return new Date(Date.parse(`${day}T00:00:00+03:00`) + 86400_000).toISOString(); }

type Filterable = { eq(column: string, value: string): Filterable; gte(column: string, value: string): Filterable; lt(column: string, value: string): Filterable };
/** Applies filters to a Supabase query builder over audit_events. */
export function applyAuditFilters<Q>(query: Q, filters: AuditFilters): Q {
  let result = query as unknown as Filterable;
  if (filters.entity) result = result.eq("entity", filters.entity);
  if (filters.action) result = result.eq("action", filters.action);
  if (filters.actor) result = result.eq("actor_id", filters.actor);
  if (filters.from) result = result.gte("created_at", riyadhDayStart(filters.from));
  if (filters.to) result = result.lt("created_at", riyadhDayEnd(filters.to));
  return result as unknown as Q;
}

/** CSV with a BOM so Excel opens Arabic text correctly; cells that could run as formulas are neutralised. */
export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (value: string | number | null) => {
    let text = value === null ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return "﻿" + rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
