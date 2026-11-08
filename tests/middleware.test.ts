import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
import { middleware } from "../middleware";

type CookieAdapter = {
  getAll: () => { name: string; value: string }[];
  setAll: (items: { name: string; value: string; options?: { path?: string; httpOnly?: boolean; sameSite?: "lax" } }[], headers: Record<string, string>) => void;
};

function authResult(user: { id: string } | null, error: object | null = null, refresh: boolean | "twice" = false) {
  mocks.createServerClient.mockImplementation((_url: string, _key: string, options: { cookies: CookieAdapter }) => ({
    auth: {
      getClaims: vi.fn(async () => {
        if (refresh) options.cookies.setAll([
          { name: "sb-session", value: "refreshed", options: { path: "/", httpOnly: true, sameSite: "lax" } },
        ], { "Cache-Control": "private, no-store", Expires: "0", Pragma: "no-cache" });
        if (refresh === "twice") options.cookies.setAll([
          { name: "sb-secondary", value: "second", options: { path: "/" } },
        ], {});
        return { data: user ? { claims: { sub: user.id } } : null, error };
      }),
    },
  }));
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-publishable-key");
  mocks.createServerClient.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("protected route session boundary", () => {
  it("fails closed when configuration is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const response = await middleware(new NextRequest("https://seer.test/dashboard"));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("redirects anonymous nested requests and clears query parameters", async () => {
    authResult(null);
    const response = await middleware(new NextRequest("https://seer.test/dashboard/operations?org=private-id"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://seer.test/login");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects a reported auth error even if user data is returned", async () => {
    authResult({ id: "stale-user" }, { message: "invalid token" });
    const response = await middleware(new NextRequest("https://seer.test/dashboard"));
    expect(response.headers.get("location")).toBe("https://seer.test/login");
  });

  it("passes a verified user and forwards refresh cookies to browser and server", async () => {
    authResult({ id: "verified-user" }, null, true);
    const request = new NextRequest("https://seer.test/dashboard");
    const response = await middleware(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(request.cookies.get("sb-session")?.value).toBe("refreshed");
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("preserves cleared/refreshed cookies and cache headers on auth redirects", async () => {
    authResult(null, null, true);
    const response = await middleware(new NextRequest("https://seer.test/dashboard/assistant"));
    expect(response.headers.get("location")).toBe("https://seer.test/login");
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it("retains earlier cookies and cache headers when auth writes twice", async () => {
    authResult({ id: "verified-user" }, null, "twice");
    const response = await middleware(new NextRequest("https://seer.test/dashboard"));
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
    expect(response.cookies.get("sb-secondary")?.value).toBe("second");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("allows the sign-in page without an authenticated session", async () => {
    authResult(null);
    const response = await middleware(new NextRequest("https://seer.test/login"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
