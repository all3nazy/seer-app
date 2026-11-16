"use server";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { serviceClient } from "../../lib/supabase/service";
import { loginEmail } from "../../lib/login";
import { classifyAuthError, clientIp, type LoginCheck } from "../../lib/login-guard";
import { lockMessage, signInMessages } from "../../lib/login-messages";

export type SignInResult = { ok: true } | { ok: false; reason: "locked" | "invalid" | "captcha" | "busy" | "unavailable"; error: string };

/**
 * Password sign-in on the server, so failures are seen and limited:
 * login_check (account or IP locked → stop here, Supabase is not asked) → signInWithPassword with
 * the captcha token when there is one (the session cookies are set on this response, as the browser
 * client would) → login_record. If the guard is not reachable (e.g. before its migration is
 * applied) sign-in still works and the problem is logged.
 */
export async function signIn(login: string, password: string, captchaToken?: string | null): Promise<SignInResult> {
  if (typeof login !== "string" || typeof password !== "string" || !login.trim() || !password || login.length > 254 || password.length > 200) {
    return { ok: false, reason: "invalid", error: signInMessages.invalid };
  }
  const email = loginEmail(login);
  const head = await headers();
  const ip = clientIp(head);
  const userAgent = (head.get("user-agent") ?? "").slice(0, 300) || null;
  const guard = serviceClient();
  if (guard) {
    const { data, error } = await guard.rpc("login_check", { p_login: email, p_ip: ip });
    if (error) console.error("login guard: check unavailable", error.code ?? "");
    const check = data as LoginCheck | null;
    if (check?.locked) return { ok: false, reason: "locked", error: lockMessage(check.retry_after_seconds) };
  } else console.error("login guard: service role not configured");

  let outcome: ReturnType<typeof classifyAuthError>;
  try {
    const client = await createSupabaseServerClient(ip ? { forwardedFor: ip } : undefined);
    const token = typeof captchaToken === "string" && captchaToken.length <= 4096 ? captchaToken.trim() : "";
    const { error } = await client.auth.signInWithPassword({ email, password, ...(token ? { options: { captchaToken: token } } : {}) });
    outcome = classifyAuthError(error ? { code: (error as { code?: string }).code, status: (error as { status?: number }).status, message: error.message } : null);
  } catch {
    outcome = "unavailable";
  }
  // Only a sign-in Supabase accepted or refused counts; a captcha, rate-limit or outage answer does not.
  if (guard && (outcome === "ok" || outcome === "invalid")) {
    const { error } = await guard.rpc("login_record", { p_login: email, p_ip: ip, p_ok: outcome === "ok", p_user_agent: userAgent });
    if (error) console.error("login guard: record unavailable", error.code ?? "");
  }
  return outcome === "ok" ? { ok: true } : { ok: false, reason: outcome, error: signInMessages[outcome] };
}
