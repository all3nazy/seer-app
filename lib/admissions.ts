import { uuid, ValidationError } from "./operations";
import { isIsoDate, riyadhToday } from "./students";
import { relationships } from "./team";

export const applicationStatuses = ["new", "reviewing", "interview", "waitlisted", "accepted", "rejected", "enrolled", "withdrawn"] as const;
export type ApplicationStatus = (typeof applicationStatuses)[number];
export const applicationStatusLabels: Record<ApplicationStatus, string> = {
  new: "جديد", reviewing: "قيد المراجعة", interview: "مقابلة", waitlisted: "قائمة الانتظار",
  accepted: "مقبول", rejected: "مرفوض", enrolled: "مسجّل طالبًا", withdrawn: "منسحب",
};
export const applicationStatusTone: Record<ApplicationStatus, string> = {
  new: "coral", reviewing: "", interview: "", waitlisted: "", accepted: "ok", rejected: "rose", enrolled: "ok", withdrawn: "rose",
};
/** Statuses a manager can set by hand; "enrolled" happens only through conversion. */
export const manualStatuses = applicationStatuses.filter(status => status !== "enrolled");
export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === "string" && applicationStatuses.some(status => status === value);
}

export type Application = {
  id: string; reference: string; child_name: string; child_birth_date: string | null; child_gender: string | null;
  grade_level_id: string | null; guardian_name: string; guardian_phone: string; guardian_email: string | null;
  relationship: string; family_notes: string | null; status: ApplicationStatus; interview_at: string | null;
  staff_notes: string | null; child_id: string | null; created_at: string;
};

function required(data: FormData, key: string, label: string, max = 120): string {
  const value = data.get(key);
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > max) throw new ValidationError(`اكتب ${label}.`);
  return value.trim();
}
/** The public form's fields, validated before they reach the database function. */
export function applicationPayload(data: FormData): Record<string, string> {
  const phone = required(data, "guardian_phone", "رقم الجوال", 16).replace(/[\s-]/g, "");
  if (!/^\+?[0-9]{8,15}$/.test(phone)) throw new ValidationError("رقم الجوال من ٨ إلى ١٥ رقمًا، ويمكن أن يبدأ بعلامة +.");
  const email = data.get("guardian_email");
  if (email && (typeof email !== "string" || email.trim().length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))) throw new ValidationError("اكتب بريدًا إلكترونيًا صحيحًا أو اتركه فارغًا.");
  const birth = data.get("child_birth_date");
  if (birth && (!isIsoDate(birth) || birth > riyadhToday())) throw new ValidationError("أدخل تاريخ ميلاد صحيحًا.");
  const gender = data.get("child_gender");
  if (gender && gender !== "male" && gender !== "female") throw new ValidationError("اختر جنس الطفل.");
  const relationship = data.get("relationship");
  if (typeof relationship !== "string" || !relationships.some(item => item === relationship)) throw new ValidationError("اختر صلة القرابة.");
  const grade = data.get("grade_level_id");
  const notes = data.get("family_notes");
  if (notes && (typeof notes !== "string" || notes.length > 1000)) throw new ValidationError("الملاحظات لا تتجاوز ١٠٠٠ حرف.");
  if (data.get("consent") !== "on") throw new ValidationError("وافق على استخدام البيانات لغرض القبول فقط.");
  return {
    child_name: required(data, "child_name", "اسم الطفل"),
    child_birth_date: typeof birth === "string" ? birth : "",
    child_gender: typeof gender === "string" ? gender : "",
    grade_level_id: grade ? uuid(grade) : "",
    guardian_name: required(data, "guardian_name", "اسم ولي الأمر"),
    guardian_phone: phone,
    guardian_email: typeof email === "string" ? email.trim().toLowerCase() : "",
    relationship,
    family_notes: typeof notes === "string" ? notes.trim() : "",
  };
}

export function reviewValues(data: FormData): { status: ApplicationStatus; interview_at: string | null; staff_notes: string | null; grade_level_id: string | null } {
  const status = data.get("status");
  if (!isApplicationStatus(status) || status === "enrolled") throw new ValidationError("اختر حالة صالحة.");
  const interview = data.get("interview_at");
  let interviewAt: string | null = null;
  if (interview) {
    if (typeof interview !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(interview)) throw new ValidationError("أدخل موعد مقابلة صحيحًا.");
    interviewAt = new Date(`${interview}:00+03:00`).toISOString();
  }
  const notes = data.get("staff_notes");
  if (notes && (typeof notes !== "string" || notes.length > 2000)) throw new ValidationError("الملاحظات الداخلية لا تتجاوز ٢٠٠٠ حرف.");
  const grade = data.get("grade_level_id");
  return { status, interview_at: interviewAt, staff_notes: typeof notes === "string" && notes.trim() ? notes.trim() : null, grade_level_id: grade ? uuid(grade) : null };
}

/** A Riyadh wall-clock value for a datetime-local input. */
export function riyadhLocalInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(Date.parse(iso) + 3 * 3600_000).toISOString().slice(0, 16);
}
