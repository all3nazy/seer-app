/**
 * One codebase, two Vercel projects:
 * - "app" (default): the subscriber platform. /admin/** does not exist here.
 * - "admin" («سِير أدمن»): only /admin/** and its own sign-in; everything else does not exist.
 * SEER_APP_SURFACE picks the side; SEER_APP_URL and SEER_ADMIN_URL let each side link to the other.
 */
export type Surface = "app" | "admin";
type Env = Record<string, string | undefined>;

export function appSurface(env: Env = process.env): Surface {
  return (env.SEER_APP_SURFACE ?? "").trim().toLowerCase() === "admin" ? "admin" : "app";
}

/** An https origin from an env value (a bare host is accepted), or null. */
export function originOf(value: string | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.username || url.password) return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}

/** The subscriber platform's address: SEER_APP_URL, else the official host, else the default. */
export function appBase(env: Env = process.env): string {
  return originOf(env.SEER_APP_URL) ?? originOf(env.SEER_CANONICAL_HOST) ?? "https://seersa.vercel.app";
}

/** «سِير أدمن»'s address (SEER_ADMIN_URL), or null when it is not set. */
export function adminBase(env: Env = process.env): string | null {
  return originOf(env.SEER_ADMIN_URL);
}

export const isAdminPath = (path: string) => path === "/admin" || path.startsWith("/admin/") || path.startsWith("/admin?") || path.startsWith("/admin#");

/**
 * A full link for messages that leave the app (Telegram buttons, push notifications, emails):
 * /admin… goes to «سِير أدمن», everything else to the subscriber platform. Absolute links stay.
 * Without SEER_ADMIN_URL, admin links fall back to `fallbackAdmin` (e.g. this request's origin on
 * the admin side), then to the app address.
 */
export function absoluteLink(path: string, env: Env = process.env, fallbackAdmin?: string | null): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const base = isAdminPath(path) ? adminBase(env) ?? fallbackAdmin ?? appBase(env) : appBase(env);
  return `${base}${path}`;
}

/** Admin paths that work without a session (sign-in and two-step verification). */
export const adminPublicPaths = /^\/admin\/(login|verify)(\/|$)/;

export type SurfaceDecision = { kind: "next" } | { kind: "notFound" } | { kind: "redirect"; to: string } | { kind: "robots" };

/**
 * What a surface does with a path, before sessions are looked at. Paths are already without
 * Next's own files and static assets (see the middleware matcher).
 */
export function routeFor(surface: Surface, path: string): SurfaceDecision {
  if (surface === "app") return isAdminPath(path) ? { kind: "notFound" } : { kind: "next" };
  if (path === "/robots.txt") return { kind: "robots" };
  if (path === "/" || path === "") return { kind: "redirect", to: "/admin" };
  return isAdminPath(path) ? { kind: "next" } : { kind: "notFound" };
}

/** The sign-in page of a surface (an admin is never sent to the subscriber sign-in, or the reverse). */
export const signInPath = (surface: Surface) => surface === "admin" ? "/admin/login" : "/login";
