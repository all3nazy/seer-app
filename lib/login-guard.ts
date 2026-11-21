import { isIP } from "node:net";
export { lockMessage, signInMessages } from "./login-messages";

/**
 * Server-side sign-in guard (with public.login_check / public.login_record in the database).
 * Server only: it reads request headers and is used by app/login/actions.ts.
 */
export type LoginCheck = { locked: boolean; scope: "account" | "ip" | null; retry_after_seconds: number };

/**
 * The client's IP: the first x-forwarded-for value (Vercel sets this header itself and drops what
 * the client sent), else x-real-ip. Ports and IPv6 brackets are removed; anything that is not an IP
 * address is ignored.
 */
export function clientIp(headers: Pick<Headers, "get">): string | null {
  const candidates = [(headers.get("x-forwarded-for") ?? "").split(",")[0], headers.get("x-real-ip") ?? ""];
  for (const raw of candidates) {
    let value = raw.trim();
    if (!value) continue;
    // [2001:db8::1]:443 → 2001:db8::1 ; 203.0.113.7:51234 → 203.0.113.7
    const bracketed = value.match(/^\[([^\]]+)\](?::\d+)?$/);
    if (bracketed) value = bracketed[1];
    else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) value = value.replace(/:\d+$/, "");
    if (value.toLowerCase().startsWith("::ffff:") && isIP(value.slice(7)) === 4) value = value.slice(7);
    if (isIP(value)) return value.toLowerCase();
  }
  return null;
}

/** How Supabase's answer is treated: only a refused password counts as a failed attempt. */
export function classifyAuthError(error: { code?: string; status?: number; message?: string } | null): "ok" | "invalid" | "captcha" | "busy" | "unavailable" {
  if (!error) return "ok";
  const code = error.code ?? "";
  if (code === "captcha_failed" || /captcha/i.test(error.message ?? "")) return "captcha";
  if (code === "over_request_rate_limit" || error.status === 429) return "busy";
  if (error.status && error.status >= 500) return "unavailable";
  if (!error.status && !code) return "unavailable";
  return "invalid";
}
