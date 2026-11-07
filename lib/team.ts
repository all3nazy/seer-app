import { ValidationError } from "./operations";

export const roles = ["owner", "admin", "staff"] as const;
export type Role = (typeof roles)[number];
export const roleLabels: Record<Role, string> = { owner: "مالك", admin: "مدير", staff: "موظف" };
export type Member = { user_id: string; role: Role; display_name: string | null };
export type Invitation = { id: string; email: string; role: Role; display_name: string | null; expires_at: string };

export const relationships = ["father", "mother", "guardian", "other"] as const;
export type Relationship = (typeof relationships)[number];
export const relationshipLabels: Record<Relationship, string> = { father: "الأب", mother: "الأم", guardian: "ولي أمر", other: "قريب آخر" };

export function isRole(value: unknown): value is Role { return typeof value === "string" && roles.some(role => role === value); }
export function memberName(member: Pick<Member, "display_name" | "role"> | undefined, self = false): string {
  if (!member) return "عضو سابق";
  const name = member.display_name?.trim() || `${roleLabels[member.role]} بدون اسم`;
  return self ? `${name} (أنت)` : name;
}
export function displayName(value: FormDataEntryValue | null, required = false): string | null {
  if (value === null || (typeof value === "string" && !value.trim())) {
    if (required) throw new ValidationError("اكتب الاسم.");
    return null;
  }
  if (typeof value !== "string" || value.trim().length > 80) throw new ValidationError("الاسم لا يتجاوز ٨٠ حرفًا.");
  return value.trim();
}
export function inviteValues(data: FormData): { email: string; role: "admin" | "staff"; name: string | null } {
  const email = data.get("email");
  if (typeof email !== "string" || email.trim().length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) throw new ValidationError("اكتب بريدًا إلكترونيًا صحيحًا.");
  const role = data.get("role");
  if (role !== "admin" && role !== "staff") throw new ValidationError("اختر صلاحية المدير أو الموظف.");
  return { email: email.trim().toLowerCase(), role, name: displayName(data.get("display_name")) };
}
export function relationshipValue(value: unknown): Relationship {
  if (typeof value !== "string" || !relationships.some(item => item === value)) throw new ValidationError("اختر صلة القرابة.");
  return value as Relationship;
}
/** A generic, credential-free message a manager can send to an invited person. */
export function invitationMessage(origin: string, organization: string): string {
  return `هلا، أضفتك في «${organization}» على منصة سِير. فعّل حسابك بنفس بريدك الإلكتروني من هنا: ${origin}/auth/activate`;
}
