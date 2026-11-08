import { uuid, ValidationError } from "./operations";
import { digits } from "./documents";
import { isIsoDate } from "./students";

export const contractTypes = ["full_time", "part_time", "fixed_term", "hourly"] as const;
export const contractLabels: Record<(typeof contractTypes)[number], string> = { full_time: "دوام كامل", part_time: "دوام جزئي", fixed_term: "عقد محدد المدة", hourly: "بالساعة" };
export const leaveKinds = ["annual", "sick", "emergency", "unpaid", "other"] as const;
export type LeaveKind = (typeof leaveKinds)[number];
export const leaveLabels: Record<LeaveKind, string> = { annual: "سنوية", sick: "مرضية", emergency: "اضطرارية", unpaid: "بدون راتب", other: "أخرى" };
export const leaveStatusLabels: Record<string, string> = { pending: "بانتظار الموافقة", approved: "معتمدة", rejected: "مرفوضة", cancelled: "ملغاة" };
export const leaveStatusTone: Record<string, string> = { pending: "coral", approved: "ok", rejected: "rose", cancelled: "" };
export const staffAttendanceStatuses = ["present", "late", "absent", "leave"] as const;
export const staffAttendanceLabels: Record<(typeof staffAttendanceStatuses)[number], string> = { present: "حاضر", late: "متأخر", absent: "غائب", leave: "إجازة" };

export type StaffProfile = {
  id: string; user_id: string | null; full_name: string; job_title: string | null; national_id: string | null; nationality: string | null; phone: string | null;
  hire_date: string | null; contract_type: (typeof contractTypes)[number]; contract_end: string | null; basic_salary: number; housing_allowance: number;
  transport_allowance: number; other_allowance: number; gosi_rate: number; annual_leave_days: number; iban: string | null; status: "active" | "left"; notes: string | null;
};
export const staffColumns = "id,user_id,full_name,job_title,national_id,nationality,phone,hire_date,contract_type,contract_end,basic_salary,housing_allowance,transport_allowance,other_allowance,gosi_rate,annual_leave_days,iban,status,notes";
export function monthlyPay(profile: Pick<StaffProfile, "basic_salary" | "housing_allowance" | "transport_allowance" | "other_allowance">): number {
  return Number(profile.basic_salary) + Number(profile.housing_allowance) + Number(profile.transport_allowance) + Number(profile.other_allowance);
}
/** Days until a fixed-term contract ends (negative when already ended), or null. */
export function contractDaysLeft(end: string | null, today: string): number | null {
  return end ? Math.round((Date.parse(end) - Date.parse(today)) / 86400_000) : null;
}

const str = (data: FormData, key: string) => { const v = data.get(key); return typeof v === "string" ? v.trim() : ""; };
const amount = (data: FormData, key: string, label: string) => {
  const raw = digits(str(data, key) || "0");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(raw)) throw new ValidationError(`${label}: أدخل مبلغًا صحيحًا.`);
  return Number(raw);
};
export function staffValues(data: FormData) {
  const name = str(data, "full_name");
  if (!name || name.length > 120) throw new ValidationError("اكتب اسم الموظف.");
  const nid = digits(str(data, "national_id"));
  if (nid && !/^[12]\d{9}$/.test(nid)) throw new ValidationError("رقم الهوية أو الإقامة ١٠ أرقام يبدأ بـ ١ أو ٢.");
  const phone = digits(str(data, "phone"));
  if (phone && !/^\+?\d{8,15}$/.test(phone)) throw new ValidationError("رقم الجوال غير صحيح.");
  const iban = digits(str(data, "iban")).toUpperCase();
  if (iban && !/^SA\d{22}$/.test(iban)) throw new ValidationError("الآيبان يبدأ بـ SA ويتبعه ٢٢ رقمًا.");
  const hire = str(data, "hire_date"), end = str(data, "contract_end");
  if ((hire && !isIsoDate(hire)) || (end && !isIsoDate(end))) throw new ValidationError("تاريخ غير صحيح.");
  if (hire && end && end < hire) throw new ValidationError("نهاية العقد قبل تاريخ المباشرة.");
  const contract = str(data, "contract_type") || "full_time";
  if (!contractTypes.includes(contract as (typeof contractTypes)[number])) throw new ValidationError("نوع العقد غير صالح.");
  const gosi = Number(digits(str(data, "gosi_rate") || "0"));
  if (!Number.isFinite(gosi) || gosi < 0 || gosi > 25) throw new ValidationError("نسبة التأمينات من ٠ إلى ٢٥.");
  const leaveDays = Number(digits(str(data, "annual_leave_days") || "21"));
  if (!Number.isInteger(leaveDays) || leaveDays < 0 || leaveDays > 60) throw new ValidationError("أيام الإجازة السنوية من ٠ إلى ٦٠.");
  const user = str(data, "user_id");
  return {
    full_name: name, job_title: str(data, "job_title").slice(0, 80) || null, national_id: nid || null, nationality: str(data, "nationality").slice(0, 40) || null,
    phone: phone || null, hire_date: hire || null, contract_type: contract, contract_end: end || null,
    basic_salary: amount(data, "basic_salary", "الراتب الأساسي"), housing_allowance: amount(data, "housing_allowance", "بدل السكن"),
    transport_allowance: amount(data, "transport_allowance", "بدل النقل"), other_allowance: amount(data, "other_allowance", "بدلات أخرى"),
    gosi_rate: gosi, annual_leave_days: leaveDays, iban: iban || null, status: str(data, "status") === "left" ? "left" : "active",
    notes: str(data, "notes").slice(0, 1000) || null, user_id: user ? uuid(user) : null,
  };
}
export function leaveValues(data: FormData) {
  const kind = str(data, "kind");
  if (!leaveKinds.includes(kind as LeaveKind)) throw new ValidationError("اختر نوع الإجازة.");
  const starts = str(data, "starts_on"), ends = str(data, "ends_on") || starts;
  if (!isIsoDate(starts) || !isIsoDate(ends) || ends < starts) throw new ValidationError("تاريخ الإجازة غير صحيح.");
  if ((Date.parse(ends) - Date.parse(starts)) / 86400_000 > 120) throw new ValidationError("الإجازة لا تتجاوز ١٢٠ يومًا.");
  return { kind, starts_on: starts, ends_on: ends, reason: str(data, "reason").slice(0, 500) || null };
}
/** Bank transfer sheet (CSV) for an approved payroll. */
export function payrollCsvRows(lines: { full_name: string; iban: string | null; net: number }[]): (string | number)[][] {
  return [["الاسم", "الآيبان", "صافي الراتب"], ...lines.map(line => [line.full_name, line.iban ?? "", Number(line.net).toFixed(2)])];
}
