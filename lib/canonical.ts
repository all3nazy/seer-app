/**
 * One official address. Requests that arrive on the old production addresses are sent with a 308 to
 * the same path on SEER_CANONICAL_HOST (the browser keeps the #fragment, e.g. invite tokens).
 * Not redirected: Vercel's per-branch preview addresses, /api (webhooks and cron call those
 * addresses directly), and /auth (activation links finish on the address they were sent from,
 * where the browser holds the sign-in verifier, then continue to the official address).
 */
export const legacyHosts = ["seer-app-psi.vercel.app", "seerksa.vercel.app"];

export function canonicalHost(env: Record<string, string | undefined> = process.env): string | null {
  const value = (env.SEER_CANONICAL_HOST ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return /^[a-z0-9.-]+(:\d+)?$/.test(value) ? value : null;
}

export function isLegacyHost(host: string | null | undefined): boolean {
  return legacyHosts.includes((host ?? "").toLowerCase().split(":")[0]);
}

/** The official URL for this request, or null when it should be served where it is. */
export function canonicalRedirect(host: string | null | undefined, pathname: string, search: string, env?: Record<string, string | undefined>): string | null {
  const target = canonicalHost(env);
  if (!target || !isLegacyHost(host)) return null;
  if (pathname === "/api" || pathname.startsWith("/api/") || pathname === "/auth" || pathname.startsWith("/auth/")) return null;
  return `https://${target}${pathname}${search}`;
}

/** Where to go after an activation link finished on an old address: sign in on the official one. */
export function afterActivation(host: string | null | undefined, path: string, env?: Record<string, string | undefined>): string | null {
  const target = canonicalHost(env);
  return target && isLegacyHost(host) ? `https://${target}${path}` : null;
}
