import { describe, expect, it } from "vitest";
import { afterActivation, canonicalHost, canonicalRedirect } from "../lib/canonical";

const env = { SEER_CANONICAL_HOST: "seersa.vercel.app" };

describe("one official address", () => {
  it.each(["seer-app-psi.vercel.app", "seerksa.vercel.app", "SEERKSA.vercel.app", "seer-app-psi.vercel.app:443"])("sends %s to the official address with the same path and query", host => {
    expect(canonicalRedirect(host, "/dashboard/support/abc", "?org=1&x=2", env)).toBe("https://seersa.vercel.app/dashboard/support/abc?org=1&x=2");
    expect(canonicalRedirect(host, "/", "", env)).toBe("https://seersa.vercel.app/");
    expect(canonicalRedirect(host, "/invite", "", env)).toBe("https://seersa.vercel.app/invite");
  });
  it("does nothing when SEER_CANONICAL_HOST is empty or invalid", () => {
    for (const value of [undefined, "", "   ", "not a host!"]) expect(canonicalRedirect("seer-app-psi.vercel.app", "/", "", { SEER_CANONICAL_HOST: value })).toBeNull();
  });
  it("accepts the variable with or without https:// and a trailing slash", () => {
    expect(canonicalHost({ SEER_CANONICAL_HOST: "https://SeerSA.vercel.app/" })).toBe("seersa.vercel.app");
  });
  it("leaves the official address, Vercel previews and local addresses alone", () => {
    for (const host of ["seersa.vercel.app", "seer-jrdmbu7zj-segno-sa.vercel.app", "seer-app-git-pilot-polish-segno-sa.vercel.app", "127.0.0.1:3100", "localhost", null]) {
      expect(canonicalRedirect(host, "/dashboard", "", env), String(host)).toBeNull();
    }
  });
  it("never redirects /api (webhooks, cron) or /auth (activation links)", () => {
    for (const path of ["/api", "/api/messages/dispatch", "/api/payments/webhook", "/auth/callback", "/auth/activate", "/auth"]) {
      expect(canonicalRedirect("seer-app-psi.vercel.app", path, "?code=x", env), path).toBeNull();
    }
    expect(canonicalRedirect("seer-app-psi.vercel.app", "/apiary", "", env)).toBe("https://seersa.vercel.app/apiary");
  });
  it("an activation finished on an old address continues to sign-in on the official one", () => {
    expect(afterActivation("seerksa.vercel.app", "/login?activated=1", env)).toBe("https://seersa.vercel.app/login?activated=1");
    expect(afterActivation("seersa.vercel.app", "/login?activated=1", env)).toBeNull();
    expect(afterActivation("seerksa.vercel.app", "/login?activated=1", {})).toBeNull();
  });
});
