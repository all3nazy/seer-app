import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifySetupSession } from "../lib/auth-setup";
function fixture(user: object | null = { id: "verified-user" }, sessionError: object | null = null, authError: object | null = null) {
  const calls: string[] = [];
  const setSession = vi.fn(async () => { calls.push("setSession"); return { error: sessionError }; });
  const getUser = vi.fn(async () => { calls.push("getUser"); return { data: { user }, error: authError }; });
  const create = vi.fn(() => { calls.push("create"); return { auth: { setSession, getUser } } as unknown as Pick<SupabaseClient, "auth">; });
  const clear = vi.fn(() => { calls.push("clear"); });
  return { calls, setSession, getUser, create, clear };
}
describe("administrator invitation session boundary", () => {
  it("accepts an existing server-verified user", async () => {
    const f = fixture();
    expect(await verifySetupSession(f.create, new URL("https://seer.test/auth/setup"), f.clear)).toBe(true);
    expect(f.setSession).not.toHaveBeenCalled();
    expect(f.clear).not.toHaveBeenCalled();
  });
  it("rejects a missing user", async () => {
    const f = fixture(null);
    expect(await verifySetupSession(f.create, new URL("https://seer.test/auth/setup"), f.clear)).toBe(false);
  });
  it("clears implicit tokens before initializing the PKCE client and validates the user", async () => {
    const f = fixture();
    const url = new URL("https://seer.test/auth/setup#access_token=synthetic-access&refresh_token=synthetic-refresh&type=invite");
    expect(await verifySetupSession(f.create, url, f.clear)).toBe(true);
    expect(f.calls).toEqual(["clear", "create", "setSession", "getUser"]);
    expect(f.clear).toHaveBeenCalledWith("/auth/setup");
    expect(f.setSession).toHaveBeenCalledWith({ access_token: "synthetic-access", refresh_token: "synthetic-refresh" });
  });
  it("clears malformed or provider-error callbacks without creating a client", async () => {
    for (const hash of ["#access_token=synthetic", "#refresh_token=synthetic", "#error=access_denied&error_code=otp_expired"]) {
      const f = fixture();
      expect(await verifySetupSession(f.create, new URL("https://seer.test/auth/setup" + hash), f.clear)).toBe(false);
      expect(f.clear).toHaveBeenCalledWith("/auth/setup");
      expect(f.create).not.toHaveBeenCalled();
    }
  });
  it("rejects failed token exchange without trusting the callback", async () => {
    const f = fixture(null, { message: "expired" });
    expect(await verifySetupSession(f.create, new URL("https://seer.test/auth/setup#access_token=a&refresh_token=b"), f.clear)).toBe(false);
    expect(f.getUser).not.toHaveBeenCalled();
  });
  it("rejects a callback when user verification fails after session setup", async () => {
    const f = fixture({ id: "untrusted" }, null, { message: "invalid" });
    expect(await verifySetupSession(f.create, new URL("https://seer.test/auth/setup#access_token=a&refresh_token=b"), f.clear)).toBe(false);
    expect(f.getUser).toHaveBeenCalledOnce();
  });
});
