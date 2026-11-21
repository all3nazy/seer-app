import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { absoluteLink, adminBase, appBase, appSurface, isAdminPath, originOf, routeFor, signInPath } from "../lib/surface";
import { adminGate, mfaStep, normalizeCode } from "../lib/admin-gate";
import { activeAdminItem, adminNav } from "../lib/admin-nav";
import { buttonUrl, replyMarkup, siteBase } from "../lib/telegram";

const mocks = vi.hoisted(() => ({ claims: null as Record<string, unknown> | null }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims: async () => ({ data: mocks.claims ? { claims: mocks.claims } : null, error: null }) } }) }));
import { middleware } from "../middleware";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-publishable-key");
  mocks.claims = null;
});
afterEach(() => vi.unstubAllEnvs());

describe("which side is this", () => {
  it("is the platform unless SEER_APP_SURFACE=admin", () => {
    expect(appSurface({})).toBe("app");
    expect(appSurface({ SEER_APP_SURFACE: "app" })).toBe("app");
    expect(appSurface({ SEER_APP_SURFACE: " Admin " })).toBe("admin");
    expect(appSurface({ SEER_APP_SURFACE: "admins" })).toBe("app");
  });
  it("routes: the platform has no /admin; «سِير أدمن» has only /admin, «/» goes there", () => {
    for (const path of ["/admin", "/admin/support", "/admin/login"]) expect(routeFor("app", path)).toEqual({ kind: "notFound" });
    for (const path of ["/", "/dashboard", "/login", "/invite", "/j/ABC", "/administrator"]) expect(routeFor("app", path)).toEqual({ kind: "next" });
    expect(routeFor("admin", "/")).toEqual({ kind: "redirect", to: "/admin" });
    expect(routeFor("admin", "/robots.txt")).toEqual({ kind: "robots" });
    for (const path of ["/admin", "/admin/support/x", "/admin/login", "/admin/verify"]) expect(routeFor("admin", path)).toEqual({ kind: "next" });
    for (const path of ["/dashboard", "/dashboard/settings", "/login", "/join", "/invite", "/j/ABC", "/p/x", "/pricing", "/privacy", "/api/push", "/api/telegram/webhook", "/opengraph-image", "/administrator", "/e2e/shell"]) {
      expect(routeFor("admin", path), path).toEqual({ kind: "notFound" });
    }
    expect(signInPath("admin")).toBe("/admin/login");
    expect(signInPath("app")).toBe("/login");
  });
  it("addresses of each side, and links that leave the app", () => {
    expect(originOf("seer-admin.vercel.app")).toBe("https://seer-admin.vercel.app");
    expect(originOf("https://seer-admin.vercel.app/path")).toBe("https://seer-admin.vercel.app");
    expect(originOf("http://evil.test")).toBeNull();
    expect(originOf("https://user:pw@x.test")).toBeNull();
    const env = { SEER_ADMIN_URL: "https://seer-admin.vercel.app", SEER_APP_URL: "https://seersa.vercel.app" };
    expect(adminBase(env)).toBe("https://seer-admin.vercel.app");
    expect(appBase({ SEER_CANONICAL_HOST: "seersa.vercel.app" })).toBe("https://seersa.vercel.app");
    expect(absoluteLink("/admin/support/1", env)).toBe("https://seer-admin.vercel.app/admin/support/1");
    expect(absoluteLink("/admin#login-security", env)).toBe("https://seer-admin.vercel.app/admin#login-security");
    expect(absoluteLink("/dashboard/support/1", env)).toBe("https://seersa.vercel.app/dashboard/support/1");
    expect(absoluteLink("/administrator", env)).toBe("https://seersa.vercel.app/administrator");
    expect(absoluteLink("https://wa.me/1", env)).toBe("https://wa.me/1");
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admins")).toBe(false);
  });
  it("Telegram buttons: /admin links open «سِير أدمن», others the platform", () => {
    const env = { SEER_ADMIN_URL: "https://seer-admin.vercel.app" };
    expect(buttonUrl("/admin/payments", "https://seersa.vercel.app", env)).toBe("https://seer-admin.vercel.app/admin/payments");
    expect(buttonUrl("/dashboard", "https://seersa.vercel.app", env)).toBe("https://seersa.vercel.app/dashboard");
    vi.stubEnv("SEER_ADMIN_URL", "https://seer-admin.vercel.app");
    expect(replyMarkup([{ text: "فتح", url: "/admin/support/1" }], "https://seersa.vercel.app")).toEqual({ inline_keyboard: [[{ text: "فتح", url: "https://seer-admin.vercel.app/admin/support/1" }]] });
    // The platform address for webhooks and invite links, also when running as «سِير أدمن».
    expect(siteBase({ SEER_APP_URL: "https://seersa.vercel.app", SEER_CANONICAL_HOST: "" })).toBe("https://seersa.vercel.app");
  });
});

describe("middleware per side", () => {
  const run = (url: string) => middleware(new NextRequest(url));
  it("the platform answers /admin/** with the Arabic 404 and passes /api through", async () => {
    vi.stubEnv("SEER_APP_SURFACE", "app");
    for (const path of ["/admin", "/admin/support", "/admin/login"]) {
      const response = await run(`https://seersa.vercel.app${path}`);
      expect(response.status, path).toBe(404);
      expect(response.headers.get("x-middleware-rewrite")).toContain("/__seer-not-found");
    }
    expect((await run("https://seersa.vercel.app/api/telegram/webhook")).headers.get("x-middleware-next")).toBe("1");
  });
  it("«سِير أدمن»: 404 for the platform's pages and API, «/» → /admin, robots disallow all, noindex everywhere", async () => {
    vi.stubEnv("SEER_APP_SURFACE", "admin");
    for (const path of ["/dashboard", "/login", "/invite", "/api/push", "/pricing"]) {
      const response = await run(`https://seer-admin.vercel.app${path}`);
      expect(response.status, path).toBe(404);
      expect(response.headers.get("x-robots-tag")).toContain("noindex");
    }
    const home = await run("https://seer-admin.vercel.app/");
    expect(home.status).toBe(307);
    expect(home.headers.get("location")).toBe("https://seer-admin.vercel.app/admin");
    const robots = await run("https://seer-admin.vercel.app/robots.txt");
    expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
  });
  it("«سِير أدمن»: no session → its own sign-in; password only (aal1) → verification; aal2 → the console", async () => {
    vi.stubEnv("SEER_APP_SURFACE", "admin");
    let response = await run("https://seer-admin.vercel.app/admin/payments");
    expect(response.headers.get("location")).toBe("https://seer-admin.vercel.app/admin/login");
    mocks.claims = { sub: "u1", aal: "aal1" };
    response = await run("https://seer-admin.vercel.app/admin/payments");
    expect(response.headers.get("location")).toBe("https://seer-admin.vercel.app/admin/verify");
    mocks.claims = { sub: "u1", aal: "aal2" };
    response = await run("https://seer-admin.vercel.app/admin/payments");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    // The sign-in and verification pages open without aal2.
    mocks.claims = null;
    for (const path of ["/admin/login", "/admin/verify"]) expect((await run(`https://seer-admin.vercel.app${path}`)).headers.get("location"), path).toBeNull();
  });
  it("the platform never sends anyone to the admin sign-in, and the admin side never to /login", async () => {
    vi.stubEnv("SEER_APP_SURFACE", "app");
    expect((await run("https://seersa.vercel.app/dashboard")).headers.get("location")).toBe("https://seersa.vercel.app/login");
    vi.stubEnv("SEER_APP_SURFACE", "admin");
    expect((await run("https://seer-admin.vercel.app/admin")).headers.get("location")).toBe("https://seer-admin.vercel.app/admin/login");
  });
});

describe("the console gate and two-step verification", () => {
  it("allows only a signed-in platform admin with aal2", () => {
    expect(adminGate({ signedIn: false, aal: undefined, admin: false })).toBe("/admin/login");
    expect(adminGate({ signedIn: true, aal: "aal1", admin: true })).toBe("/admin/verify");
    expect(adminGate({ signedIn: true, aal: undefined, admin: true })).toBe("/admin/verify");
    expect(adminGate({ signedIn: true, aal: "aal2", admin: false })).toBe("/admin/login");
    expect(adminGate({ signedIn: true, aal: "aal2", admin: true })).toBe("allow");
  });
  it("enrols the first time (dropping unfinished factors), then challenges", () => {
    expect(mfaStep([], "aal1")).toEqual({ kind: "enroll", stale: [] });
    expect(mfaStep([{ id: "a", factor_type: "totp", status: "unverified" }], "aal1")).toEqual({ kind: "enroll", stale: ["a"] });
    expect(mfaStep([{ id: "a", factor_type: "totp", status: "unverified" }, { id: "b", factor_type: "totp", status: "verified" }], "aal1")).toEqual({ kind: "challenge", factorId: "b" });
    expect(mfaStep([{ id: "p", factor_type: "phone", status: "verified" }], "aal1")).toEqual({ kind: "enroll", stale: [] });
    expect(mfaStep([], "aal2")).toEqual({ kind: "done" });
  });
  it("accepts six digits, also Arabic-Indic and with spaces", () => {
    expect(normalizeCode("123 456")).toBe("123456");
    expect(normalizeCode("١٢٣٤٥٦")).toBe("123456");
    expect(normalizeCode("12345")).toBeNull();
    expect(normalizeCode("12345a")).toBeNull();
  });
  it("the sidebar: groups from the design, only existing pages, longest match is active", () => {
    expect(adminNav.map(group => group.title)).toEqual([null, "المشتركين", "الإيرادات", "الدعم والتواصل", "المنصة", "الحماية والتشغيل"]);
    expect(activeAdminItem("/admin")).toBe("/admin");
    expect(activeAdminItem("/admin/support/templates")).toBe("/admin/support/templates");
    expect(activeAdminItem("/admin/support/123")).toBe("/admin/support");
    expect(activeAdminItem("/admin/subscribers/abc")).toBe("/admin/subscribers");
  });
});

describe("every sidebar item opens a page that exists", () => {
  it("has a page file in app/admin/(console)", async () => {
    const { existsSync } = await import("node:fs");
    for (const group of adminNav) for (const item of group.items) {
      const path = item.href.split("#")[0].replace(/^\/admin/, "");
      expect(existsSync(`app/admin/(console)${path}/page.tsx`), item.href).toBe(true);
    }
  });
});
