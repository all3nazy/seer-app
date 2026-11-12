import { uuid, ValidationError } from "./operations";
import { arNumber } from "./dates";

export const genders = ["male", "female"] as const;
export const genderLabels: Record<(typeof genders)[number], string> = { male: "ذكر", female: "أنثى" };
export const bloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export const attendanceStatuses = ["present", "late", "absent", "excused"] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];
export const attendanceLabels: Record<AttendanceStatus, string> = { present: "حاضر", late: "متأخر", absent: "غائب", excused: "غياب بعذر" };
export const attendanceTone: Record<AttendanceStatus, string> = { present: "ok", late: "coral", absent: "rose", excused: "" };

export type ChildProfile = {
  id: string; full_name: string; date_of_birth: string | null; gender: string | null;
  national_id: string | null; branch_id: string | null; notes: string | null; created_at: string;
  section_id: string | null; photo_consent: boolean; photo_consent_at: string | null;
};
export type ChildHealth = {
  blood_type: string | null; allergies: string | null; conditions: string | null; medications: string | null;
  emergency_name: string | null; emergency_phone: string | null; notes: string | null; updated_at: string;
};
export type AttendanceRow = { child_id: string; status: AttendanceStatus; note: string | null };

/** Today's date in Riyadh, which is the day the database uses for attendance. */
export function riyadhToday(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}
export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && attendanceStatuses.some(status => status === value);
}
export function age(dateOfBirth: string | null, today = riyadhToday()): string | null {
  if (!dateOfBirth) return null;
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let months = (ty - y) * 12 + (tm - m) - (td < d ? 1 : 0);
  if (months < 0) return null;
  const years = Math.floor(months / 12);
  months %= 12;
  if (years === 0) return `${arNumber(months)} شهر`;
  return months ? `${arNumber(years)} سنة و${arNumber(months)} شهر` : `${arNumber(years)} سنة`;
}

function optionalText(data: FormData, key: string, max: number, message: string): string | null {
  const value = data.get(key);
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) throw new ValidationError(message);
  return value.trim() || null;
}
function optionalChoice(data: FormData, key: string, allowed: readonly string[]): string | null {
  const value = data.get(key);
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !allowed.includes(value)) throw new ValidationError("القيمة المحددة غير صالحة.");
  return value;
}
function nationalId(data: FormData, key: string): string | null {
  const value = data.get(key);
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^[0-9]{10}$/.test(value.trim())) throw new ValidationError("رقم الهوية أو الإقامة ١٠ أرقام.");
  return value.trim();
}

export function profileValues(data: FormData) {
  const name = data.get("full_name");
  if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 120) throw new ValidationError("اكتب اسم الطالب، من حرف إلى ١٢٠ حرفًا.");
  const date = data.get("date_of_birth");
  if (date && (!isIsoDate(date) || date > riyadhToday())) throw new ValidationError("أدخل تاريخ ميلاد صحيحًا لا يتجاوز اليوم.");
  const branch = data.get("branch_id");
  const section = data.get("section_id");
  return {
    full_name: name.trim(),
    date_of_birth: typeof date === "string" && date ? date : null,
    gender: optionalChoice(data, "gender", genders),
    national_id: nationalId(data, "national_id"),
    branch_id: branch ? uuid(branch) : null,
    section_id: section ? uuid(section) : null,
    photo_consent: data.get("photo_consent") === "on",
    notes: optionalText(data, "notes", 1000, "الملاحظات لا تتجاوز ١٠٠٠ حرف."),
  };
}

export function healthValues(data: FormData) {
  const phone = data.get("emergency_phone");
  if (phone && (typeof phone !== "string" || !/^\+?[0-9]{8,15}$/.test(phone.trim()))) throw new ValidationError("رقم الطوارئ من ٨ إلى ١٥ رقمًا؛ يمكن أن يبدأ بعلامة +.");
  return {
    blood_type: optionalChoice(data, "blood_type", bloodTypes),
    allergies: optionalText(data, "allergies", 500, "الحساسية لا تتجاوز ٥٠٠ حرف."),
    conditions: optionalText(data, "conditions", 500, "الحالات الصحية لا تتجاوز ٥٠٠ حرف."),
    medications: optionalText(data, "medications", 500, "الأدوية لا تتجاوز ٥٠٠ حرف."),
    emergency_name: optionalText(data, "emergency_name", 120, "اسم جهة الطوارئ لا يتجاوز ١٢٠ حرفًا."),
    emergency_phone: typeof phone === "string" && phone.trim() ? phone.trim() : null,
    notes: optionalText(data, "health_notes", 1000, "الملاحظات الصحية لا تتجاوز ١٠٠٠ حرف."),
  };
}

/** Reads `status:<child id>` and `note:<child id>` fields from the attendance sheet. */
export function attendanceEntries(data: FormData): { child_id: string; status: AttendanceStatus; note: string | null }[] {
  const entries = new Map<string, { child_id: string; status: AttendanceStatus; note: string | null }>();
  for (const [key, value] of data.entries()) {
    if (!key.startsWith("status:")) continue;
    const child = uuid(key.slice(7));
    if (value === "") continue;
    if (!isAttendanceStatus(value)) throw new ValidationError("حالة حضور غير معروفة.");
    const note = data.get(`note:${child}`);
    if (note !== null && (typeof note !== "string" || note.trim().length > 200)) throw new ValidationError("الملاحظة لا تتجاوز ٢٠٠ حرف.");
    entries.set(child, { child_id: child, status: value, note: typeof note === "string" && note.trim() ? note.trim() : null });
  }
  if (entries.size > 1000) throw new ValidationError("عدد الطلاب في الكشف أكبر من المسموح.");
  return [...entries.values()];
}
