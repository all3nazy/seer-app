import { describe, expect, it, vi } from "vitest";
import { activationTypes, ActivationError, parseActivationCallback, verifyActivationInput } from "../lib/activation";
const project = "https://vhcdzonkgalpcozbhmmj.supabase.co";
const site = "https://seer-app-psi.vercel.app";
const access = "untrusted.jwt.claims";
const refresh = "opaque-refresh-token";
const fragment = `access_token=${access}&refresh_token=${refresh}&type=magiclink`;
function callback(origin = "http://localhost:3000", path = "/", hash = fragment) { return `${origin}${path}#${hash}`; }
function createClient() {
  return { auth: {
    signInWithOtp: vi.fn(async () => ({ error: null as unknown })),
    verifyOtp: vi.fn(async () => ({ error: null as unknown })),
    setSession: vi.fn(async () => ({ error: null as unknown })),
    getUser: vi.fn(async () => ({ data: { user: { email_confirmed_at: "confirmed" } as { email_confirmed_at?: string } | null }, error: null as unknown })),
  } };
}
describe("consumed activation callback parsing", () => {
  it.each(["http://localhost:3000", site])("accepts only the exact app origin or known legacy origin: %s", origin => {
    for (const path of ["/", "/auth/setup"]) {
      expect(parseActivationCallback(callback(origin, path), site)).toEqual({ access_token: access, refresh_token: refresh, type: "magiclink" });
    }
  });
  it.each(activationTypes)("accepts only an explicitly supported confirmation type: %s", type => {
    expect(parseActivationCallback(callback(site, "/", `access_token=${access}&refresh_token=${refresh}&type=${type}`), site).type).toBe(type);
  });
  it.each([
    callback("https://evil.example"),
    callback("http://localhost:3001"),
    callback("http://127.0.0.1:3000"),
    callback("https://localhost:3000"),
    callback("http://localhost:3000.evil.example"),
    callback("http://localhost:3000@evil.example"),
    callback("https://user:password@seer-app-psi.vercel.app"),
    callback(site, "/other"),
    callback(site, "/auth/setup/"),
    callback(site, "/", `access_token=${access}&refresh_token=${refresh}`),
    callback(site, "/", `access_token=${access}&type=magiclink`),
    callback(site, "/", `refresh_token=${refresh}&type=magiclink`),
    callback(site, "/", `access_token=&refresh_token=${refresh}&type=magiclink`),
    callback(site, "/", `access_token=${access}&refresh_token=&type=magiclink`),
    callback(site, "/", `${fragment}&access_token=${access}`),
    callback(site, "/", `${fragment}&refresh_token=${refresh}`),
    callback(site, "/", `${fragment}&type=recovery`),
    callback(site, "/", `access_token=${access}&refresh_token=${refresh}&type=email_change`),
    callback(site, "/", `${fragment}&error=expired`),
    callback(site, "/", `${fragment}&error_code=expired`),
    callback(site, "/", `${fragment}&error_description=denied`),
    callback(site, "/?error=expired"),
    callback(site, "/?access_token=alternate"),
    callback(site, "/?type=signup"),
    callback(site, "/", `access_token=${access}%0A&refresh_token=${refresh}&type=magiclink`),
    callback(site, "/", `access_token=${"a".repeat(6145)}&refresh_token=${refresh}&type=magiclink`),
    "javascript:alert(1)",
    "http://localhost:3000/",
    "a".repeat(8193),
  ])("rejects foreign destinations, errors, ambiguous or incomplete credentials", input => {
    expect(() => parseActivationCallback(input, site)).toThrow(ActivationError);
  });
  it("rejects an invalid app origin configuration", () => {
    for (const origin of ["javascript:bad", "https://seer-app-psi.vercel.app/path", "https://user:password@seer-app-psi.vercel.app"]) {
      expect(() => parseActivationCallback(callback(), origin)).toThrow("configuration");
    }
  });
});
describe("consumed callback session verification", () => {
  it("sets the opaque credentials then verifies the user on the auth server", async () => {
    const client = createClient();
    await verifyActivationInput(() => client, callback(), project, site);
    expect(client.auth.setSession).toHaveBeenCalledWith({ access_token: access, refresh_token: refresh });
    expect(client.auth.getUser).toHaveBeenCalledOnce();
    expect(client.auth.setSession.mock.invocationCallOrder[0]).toBeLessThan(client.auth.getUser.mock.invocationCallOrder[0]);
    expect(client.auth.verifyOtp).not.toHaveBeenCalled();
  });
  it("does not contact a pasted destination or follow its redirect query", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected destination fetch"));
    try {
      const client = createClient();
      await verifyActivationInput(() => client, callback(site, "/?redirect_to=https%3A%2F%2Fevil.example"), project, site);
      expect(network).not.toHaveBeenCalled();
    } finally { network.mockRestore(); }
  });
  it("does not construct an auth client for an invalid foreign callback", async () => {
    const create = vi.fn(createClient);
    await expect(verifyActivationInput(create, callback("https://evil.example"), project, site)).rejects.toMatchObject({ code: "invalid-link" });
    expect(create).not.toHaveBeenCalled();
  });
  it("rejects setSession failure without trusting a preexisting logged-in user", async () => {
    const client = createClient();
    client.auth.setSession.mockResolvedValue({ error: { message: access } });
    await expect(verifyActivationInput(() => client, callback(), project, site)).rejects.toMatchObject({ code: "verification", message: "verification" });
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });
  it("requires a confirmed email from getUser, never from JWT claims", async () => {
    const client = createClient();
    client.auth.getUser.mockResolvedValue({ data: { user: {} }, error: null });
    await expect(verifyActivationInput(() => client, callback(), project, site)).rejects.toMatchObject({ code: "session" });
    client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(verifyActivationInput(() => client, callback(), project, site)).rejects.toMatchObject({ code: "session" });
    client.auth.getUser.mockResolvedValue({ data: { user: { email_confirmed_at: "confirmed" } }, error: new Error("unauthorized") });
    await expect(verifyActivationInput(() => client, callback(), project, site)).rejects.toMatchObject({ code: "session" });
  });
  it("sanitizes unexpected session errors rather than exposing tokens", async () => {
    const client = createClient();
    client.auth.setSession.mockRejectedValue(new Error(callback()));
    await expect(verifyActivationInput(() => client, callback(), project, site)).rejects.toMatchObject({ message: "verification" });
  });
  it("retains the existing original Supabase verification link flow", async () => {
    const client = createClient();
    const token = "a".repeat(64);
    await verifyActivationInput(() => client, `${project}/auth/v1/verify?token=${token}&type=magiclink`, project, site);
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: token, type: "magiclink" });
    expect(client.auth.setSession).not.toHaveBeenCalled();
    expect(client.auth.getUser).toHaveBeenCalledOnce();
  });
});
