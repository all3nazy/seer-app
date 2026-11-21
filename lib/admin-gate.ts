/**
 * Who may open the console of «سِير أدمن»: a signed-in platform admin whose session passed
 * two-step verification (aal2). Returns "allow" or where to send the person (never to the
 * subscriber platform's sign-in).
 */
export function adminGate({ signedIn, aal, admin }: { signedIn: boolean; aal: unknown; admin: boolean }): "allow" | "/admin/login" | "/admin/verify" {
  if (!signedIn) return "/admin/login";
  if (aal !== "aal2") return "/admin/verify";
  return admin ? "allow" : "/admin/login";
}

/** The next step on the verification page, from the account's factors and the session level. */
export type MfaFactor = { id: string; factor_type: string; status: string };
export function mfaStep(factors: MfaFactor[], currentLevel: string | null | undefined): { kind: "done" } | { kind: "challenge"; factorId: string } | { kind: "enroll"; stale: string[] } {
  if (currentLevel === "aal2") return { kind: "done" };
  const totp = factors.filter(factor => factor.factor_type === "totp");
  const verified = totp.find(factor => factor.status === "verified");
  if (verified) return { kind: "challenge", factorId: verified.id };
  // Unfinished enrolments are removed before a new one starts.
  return { kind: "enroll", stale: totp.filter(factor => factor.status !== "verified").map(factor => factor.id) };
}

/** A six-digit code (Arabic-Indic digits and spaces are accepted). */
export function normalizeCode(input: string): string | null {
  const digits = input.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0)).replace(/\s+/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}
