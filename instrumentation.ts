/**
 * Server-side errors (pages, server actions, routes) go to the same error log as browser errors.
 * Private details are masked by the database before anything is stored.
 */
export function register() {}

export async function onRequestError(error: unknown, request: { path: string; method: string }, context: { routeType: string; routerKind?: string }) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const kind = context.routeType === "action" ? "action" : context.routeType === "route" ? "route" : "server";
    const digest = (error as { digest?: string })?.digest;
    // Next.js redirects and not-found pages are control flow, not errors.
    if (/NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK/.test(message) || /^NEXT_/.test(digest ?? "")) return;
    await fetch(`${url}/rest/v1/rpc/log_error`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ kind, message: message.slice(0, 500), route: request.path.split("?")[0], detail: `${request.method} ${context.routeType}${digest ? ` digest:${digest}` : ""}` }),
      signal: AbortSignal.timeout(3000),
    });
  } catch { /* logging must never break a request */ }
}
