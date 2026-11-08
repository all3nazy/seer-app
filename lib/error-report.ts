import { getSupabaseBrowserClient } from "./supabase";

/**
 * Sends a browser error to the platform's error log. Private details (ids, tokens, emails, phone
 * numbers) are masked by the database; the same error is sent at most once per page view.
 * Returns the fix the team wrote for this error, if any.
 */
const sent = new Set<string>();
export async function reportError(error: unknown, kind: "client" | "action" = "client"): Promise<string | null> {
  try {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const route = typeof location !== "undefined" ? location.pathname : null;
    const key = `${message}|${route}`;
    if (sent.has(key) || sent.size > 20) return null;
    sent.add(key);
    const stack = error instanceof Error ? (error.stack ?? "").split("\n").slice(0, 6).join("\n") : null;
    const org = typeof location !== "undefined" ? new URLSearchParams(location.search).get("org") : null;
    const { data } = await getSupabaseBrowserClient().rpc("log_error", { kind, message: message.slice(0, 500), route, detail: stack, org: org && /^[0-9a-f-]{36}$/i.test(org) ? org : null });
    return typeof data === "string" ? data : null;
  } catch { return null; }
}

/** Errors that fix themselves: a new deployment's files, or a dropped connection. */
export function selfHealing(error: unknown): "reload" | "offline" | null {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(text)) return "reload";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  return null;
}
