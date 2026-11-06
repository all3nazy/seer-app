import { describe, expect, it, vi } from "vitest";
import { activationTypes, ActivationError, parseActivationLink, requestActivationEmail, verifyActivationLink } from "../lib/activation";
const project = "https://vhcdzonkgalpcozbhmmj.supabase.co";
const hash = "a".repeat(64);
const link = `${project}/auth/v1/verify?token=${hash}&type=magiclink`;
function client() {
  return { auth: {
    signInWithOtp: vi.fn(async () => ({ error: null as unknown })),
    verifyOtp: vi.fn(async () => ({ error: null as unknown })),
    getUser: vi.fn(async () => ({ data: { user: { email_confirmed_at: "2026-11-06T00:00:00Z" } as { email_confirmed_at?: string } | null }, error: null as unknown })),
  } };
}
describe("activation link validation", () => {
  it.each(activationTypes)("accepts only the project's verify URL with supported type %s", type => {
    expect(parseActivationLink(`${project}/auth/v1/verify?token_hash=${hash}&type=${type}`, project)).toEqual({ token_hash: hash, type });
  });
  it("converts the Supabase token query to token_hash and ignores redirect destinations", () => {
    expect(parseActivationLink(`${link}&redirect_to=${encodeURIComponent("https://evil.example/steal")}`, project)).toEqual({ token_hash: hash, type: "magiclink" });
  });
  it.each([
    `https://evil.example/auth/v1/verify?token=${hash}&type=magiclink`,
    `https://vhcdzonkgalpcozbhmmj.supabase.co.evil.example/auth/v1/verify?token=${hash}&type=magiclink`,
    `https://vhcdzonkgalpcozbhmmj.supabase.co@evil.example/auth/v1/verify?token=${hash}&type=magiclink`,
    `https://user:secret@vhcdzonkgalpcozbhmmj.supabase.co/auth/v1/verify?token=${hash}&type=magiclink`,
    `http://vhcdzonkgalpcozbhmmj.supabase.co/auth/v1/verify?token=${hash}&type=magiclink`,
    `${project}/auth/v1/verify/other?token=${hash}&type=magiclink`,
    `${project}/auth/v1/verify/?token=${hash}&type=magiclink`,
    `${project}/auth/v1/verify?token=${hash}&type=email_change`,
    `${project}/auth/v1/verify?token=${hash}&type=magiclink&type=recovery`,
    `${project}/auth/v1/verify?token=${hash}&token=${hash}&type=magiclink`,
    `${project}/auth/v1/verify?token=${hash}&token_hash=${hash}&type=magiclink`,
    `${project}/auth/v1/verify?token=${hash}&type=magiclink#access_token=secret`,
    `${project}/auth/v1/verify?token=${hash}&type=`,
    `${project}/auth/v1/verify?type=magiclink`,
    `${project}/auth/v1/verify?token=short&type=magiclink`,
    `${project}/auth/v1/verify?token=${"a".repeat(2050)}&type=magiclink`,
    `${project}/auth/v1/verify?token=${hash}%0A&type=magiclink`,
    "/auth/v1/verify?token=secret&type=magiclink",
    "javascript:alert('secret')",
    "",
  ])("rejects a foreign, ambiguous or malformed link without returning the input", input => {
    try {
      parseActivationLink(input, project);
      expect.fail("Link should have been rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(ActivationError);
      expect((error as ActivationError).code).toBe("invalid-link");
      expect((error as Error).message).toBe("invalid-link");
    }
  });
  it.each([undefined, "", "not-a-url", "http://localhost:54321", "https://user:secret@project.supabase.co"])("fails closed for invalid project configuration", value => {
    expect(() => parseActivationLink(link, value)).toThrow("configuration");
  });
});
describe("activation verification flow", () => {
  it("does not create an auth client or invoke auth for an invalid link", async () => {
    const create = vi.fn(client);
    await expect(verifyActivationLink(create, "https://evil.example", project)).rejects.toMatchObject({ code: "invalid-link" });
    expect(create).not.toHaveBeenCalled();
  });
  it("uses verifyOtp and checks the server-authenticated user before completing", async () => {
    const authClient = client();
    await verifyActivationLink(() => authClient, link, project);
    expect(authClient.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: hash, type: "magiclink" });
    expect(authClient.auth.getUser).toHaveBeenCalledOnce();
    expect(authClient.auth.verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(authClient.auth.getUser.mock.invocationCallOrder[0]);
  });
  it("does not accept an existing browser session when the supplied link failed verification", async () => {
    const authClient = client();
    authClient.auth.verifyOtp.mockResolvedValue({ error: { message: "expired credential private detail" } });
    await expect(verifyActivationLink(() => authClient, link, project)).rejects.toMatchObject({ code: "verification", message: "verification" });
    expect(authClient.auth.getUser).not.toHaveBeenCalled();
  });
  it("requires a confirmed authenticated email after OTP verification", async () => {
    const authClient = client();
    authClient.auth.getUser.mockResolvedValue({ data: { user: {} }, error: null });
    await expect(verifyActivationLink(() => authClient, link, project)).rejects.toMatchObject({ code: "session" });
    authClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(verifyActivationLink(() => authClient, link, project)).rejects.toMatchObject({ code: "session" });
    authClient.auth.getUser.mockResolvedValue({ data: { user: { email_confirmed_at: "confirmed" } }, error: new Error("unauthorized") });
    await expect(verifyActivationLink(() => authClient, link, project)).rejects.toMatchObject({ code: "session" });
  });
  it("sanitizes thrown provider errors rather than returning a credential or URL", async () => {
    const authClient = client();
    authClient.auth.verifyOtp.mockRejectedValue(new Error(link));
    await expect(verifyActivationLink(() => authClient, link, project)).rejects.toMatchObject({ message: "verification" });
  });
});
describe("activation email request", () => {
  it("requests a verified email with a fixed setup callback and explicit account creation", async () => {
    const authClient = client();
    await requestActivationEmail(() => authClient, "  admin@example.com ", "https://seer.example.com");
    expect(authClient.auth.signInWithOtp).toHaveBeenCalledWith({ email: "admin@example.com", options: { shouldCreateUser: true, emailRedirectTo: "https://seer.example.com/auth/setup" } });
  });
  it.each(["wrong", "name@localhost", "name@example.com\nother@example.com", "a".repeat(255) + "@example.com"])("rejects malformed emails before contacting auth", async email => {
    const create = vi.fn(client);
    await expect(requestActivationEmail(create, email, "https://seer.example.com")).rejects.toMatchObject({ code: "email-request" });
    expect(create).not.toHaveBeenCalled();
  });
  it("returns no account-existence information for rate-limit or provider errors", async () => {
    const authClient = client();
    authClient.auth.signInWithOtp.mockResolvedValue({ error: { status: 429, message: "email already registered secret" } });
    await expect(requestActivationEmail(() => authClient, "admin@example.com", "https://seer.example.com")).rejects.toMatchObject({ code: "email-request", message: "email-request" });
  });
  it("rejects a callback containing a path, credentials or a non-http protocol", async () => {
    const create = vi.fn(client);
    for (const origin of ["https://seer.example.com/evil", "https://user:secret@seer.example.com", "javascript:bad"]) {
      await expect(requestActivationEmail(create, "admin@example.com", origin)).rejects.toMatchObject({ code: "configuration" });
    }
    expect(create).not.toHaveBeenCalled();
  });
});
