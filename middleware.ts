import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canonicalRedirect } from "./lib/canonical";
import { adminPublicPaths, appSurface, routeFor } from "./lib/surface";

// Paths that need the session checked or refreshed (as before the canonical redirect was added).
const sessionPaths = /^\/(dashboard|admin|login|auth)(\/|$)/;
// Next renders the app's Arabic not-found page (status 404) for an address that matches nothing.
const NOT_FOUND = "/__seer-not-found";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const surface = appSurface();
  // The subscriber platform's API (webhooks, cron, push) is not touched here.
  if (surface === "app" && (path === "/api" || path.startsWith("/api/"))) return NextResponse.next();
  // Each side shows only its own pages: /admin/** is not part of the platform, and «سِير أدمن» has
  // nothing but /admin/** («/» goes to /admin). Anything else is the normal Arabic 404.
  const decision = path === NOT_FOUND ? { kind: "next" as const } : routeFor(surface, path);
  const adminHeaders = (result: NextResponse) => { if (surface === "admin") result.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive"); return result; };
  // Same origin as the request (an address on another host would make Next proxy it).
  if (decision.kind === "notFound") return adminHeaders(NextResponse.rewrite(new URL(NOT_FOUND, request.url), { status: 404 }));
  if (decision.kind === "redirect") return adminHeaders(NextResponse.redirect(new URL(decision.to, request.url)));
  if (decision.kind === "robots") return new NextResponse("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" } });
  // Old production addresses go to the official one (308 keeps the method; the #fragment stays).
  const official = surface === "app" ? canonicalRedirect(request.headers.get("x-forwarded-host") ?? request.headers.get("host"), path, request.nextUrl.search) : null;
  if (official) return NextResponse.redirect(official, 308);
  if (!sessionPaths.test(path)) return NextResponse.next();
  // The layout reads the page and organization to enforce the subscription lock and show the right sections.
  const forwarded = new Headers(request.headers);
  forwarded.set("x-seer-path", request.nextUrl.pathname);
  forwarded.set("x-seer-org", request.nextUrl.searchParams.get("org") ?? "");
  let response = NextResponse.next({ request: { headers: forwarded } });
  const finish = (result: NextResponse) => {
    adminHeaders(result);
    response.cookies.getAll().forEach(cookie => result.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(header);
      if (value) result.headers.set(header, value);
    }
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return finish(new NextResponse("إعداد الخدمة غير مكتمل", { status: 503 }));
  }
  const supabase = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll(items, headers) {
      items.forEach(({ name, value }) => request.cookies.set(name, value));
      const previous = response;
      response = NextResponse.next({ request: { headers: forwarded } });
      previous.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
      for (const header of ["cache-control", "expires", "pragma"]) {
        const value = previous.headers.get(header);
        if (value) response.headers.set(header, value);
      }
      items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
    }
  }});
  // Verified access-token claims: checked locally when the project uses asymmetric signing keys,
  // otherwise supabase-js falls back to asking the Auth server, as getUser() did.
  const { data, error } = await supabase.auth.getClaims();
  const signedIn = !error && Boolean(data?.claims?.sub);
  if (surface === "admin") {
    // «سِير أدمن»: no session → its own sign-in; a password-only session (aal1) → two-step
    // verification. The layout and every database function check again.
    if (!adminPublicPaths.test(path) && (!signedIn || data?.claims?.aal !== "aal2")) {
      return finish(NextResponse.redirect(new URL(signedIn ? "/admin/verify" : "/admin/login", request.url)));
    }
    return finish(response);
  }
  if (path.startsWith("/dashboard") && !signedIn) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    return finish(NextResponse.redirect(target));
  }
  return finish(response);
}
// Every page (for the canonical redirect and the surface split), except Next's own files and static assets.
// /api and /robots.txt are included so «سِير أدمن» can refuse them (the platform passes /api through).
export const config = { matcher: ["/((?!_next/static|_next/image|favicon|icons/|manifest|sw\\.js|sitemap|.*\\.(?:png|jpg|jpeg|svg|webp|ico|xml|js|css|webmanifest)$).*)", "/robots.txt"] };
