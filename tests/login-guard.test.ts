import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyAuthError, clientIp } from "../lib/login-guard";
import { lockMessage, signInMessages } from "../lib/login-messages";

const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  guard: { rpc: vi.fn() } as { rpc: ReturnType<typeof vi.fn> } | null,
  signInWithPassword: vi.fn(),
  createServer: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("../lib/supabase/service", () => ({ serviceClient: () => mocks.guard }));
vi.mock("../lib/supabase/server", () => ({ createSupabaseServerClient: (...args: unknown[]) => { mocks.createServer(...args); return Promise.resolve({ auth: { signInWithPassword: mocks.signInWithPassword } }); } }));
import { signIn } from "../app/login/actions";

describe("client IP", () => {
  const h = (values: Record<string, string>) => new Headers(values);
  it("takes the first x-forwarded-for value, else x-real-ip", () => {
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" }))).toBe("203.0.113.7");
    expect(clientIp(h({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.4" }))).toBe("203.0.113.7");
  });
  it("removes ports and brackets, handles IPv6 and IPv4-mapped addresses", () => {
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7:51234" }))).toBe("203.0.113.7");
    expect(clientIp(h({ "x-forwarded-for": "[2001:DB8::1]:443" }))).toBe("2001:db8::1");
    expect(clientIp(h({ "x-forwarded-for": "2001:db8::2" }))).toBe("2001:db8::2");
    expect(clientIp(h({ "x-forwarded-for": "::ffff:192.0.2.9" }))).toBe("192.0.2.9");
  });
  it("ignores anything that is not an IP address", () => {
    expect(clientIp(h({ "x-forwarded-for": "unknown, 203.0.113.7" }))).toBeNull();
    expect(clientIp(h({ "x-forwarded-for": "<script>", "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(h({ "x-forwarded-for": "999.1.1.1" }))).toBeNull();
    expect(clientIp(h({}))).toBeNull();
  });
});

describe("lock rules on the app side", () => {
  it("the lock message gives the minutes left (at least one), in Arabic", () => {
    expect(lockMessage(14 * 60 + 5)).toBe("توقف الدخول مؤقتًا بسبب محاولات كثيرة. حاول بعد ١٥ دقيقة أو تواصل مع إدارتك.");
    expect(lockMessage(10)).toBe("توقف الدخول مؤقتًا بسبب محاولات كثيرة. حاول بعد ١ دقيقة أو تواصل مع إدارتك.");
    expect(lockMessage(5 * 60)).toBe("توقف الدخول مؤقتًا بسبب محاولات كثيرة. حاول بعد ٥ دقائق أو تواصل مع إدارتك.");
    expect(lockMessage(Number.NaN)).toContain("١ دقيقة");
  });
  it("only a refused password counts as a failed attempt", () => {
    expect(classifyAuthError(null)).toBe("ok");
    expect(classifyAuthError({ code: "invalid_credentials", status: 400 })).toBe("invalid");
    expect(classifyAuthError({ code: "email_not_confirmed", status: 400 })).toBe("invalid");
    expect(classifyAuthError({ code: "captcha_failed", status: 400 })).toBe("captcha");
    expect(classifyAuthError({ status: 400, message: "captcha protection: request disallowed" })).toBe("captcha");
    expect(classifyAuthError({ code: "over_request_rate_limit", status: 429 })).toBe("busy");
    expect(classifyAuthError({ status: 503 })).toBe("unavailable");
    expect(classifyAuthError({ message: "fetch failed" })).toBe("unavailable");
  });
});

describe("server sign-in", () => {
  beforeEach(() => {
    mocks.headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Test Browser" });
    mocks.guard = { rpc: vi.fn(async (name: string) => name === "login_check" ? { data: { locked: false, scope: null, retry_after_seconds: 0 }, error: null } : { data: null, error: null }) };
    mocks.signInWithPassword.mockReset().mockResolvedValue({ error: null });
    mocks.createServer.mockReset();
  });

  it("checks the lock, signs in with the captcha token and the client IP, and records the success", async () => {
    expect(await signIn(" Huda.T ", "secret123", "turnstile-token")).toEqual({ ok: true });
    expect(mocks.guard!.rpc).toHaveBeenNthCalledWith(1, "login_check", { p_login: "huda.t@users.seer.local", p_ip: "203.0.113.7" });
    expect(mocks.createServer).toHaveBeenCalledWith({ forwardedFor: "203.0.113.7" });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "huda.t@users.seer.local", password: "secret123", options: { captchaToken: "turnstile-token" } });
    expect(mocks.guard!.rpc).toHaveBeenNthCalledWith(2, "login_record", { p_login: "huda.t@users.seer.local", p_ip: "203.0.113.7", p_ok: true, p_user_agent: "Test Browser" });
  });

  it("without a captcha token (Turnstile not configured) signs in as before", async () => {
    await signIn("a@b.test", "secret123", null);
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.test", password: "secret123" });
  });

  it("a locked account or IP stops before Supabase is asked, with the minutes left", async () => {
    mocks.guard = { rpc: vi.fn(async () => ({ data: { locked: true, scope: "account", retry_after_seconds: 600 }, error: null })) };
    expect(await signIn("a@b.test", "secret123")).toEqual({ ok: false, reason: "locked", error: "توقف الدخول مؤقتًا بسبب محاولات كثيرة. حاول بعد ١٠ دقائق أو تواصل مع إدارتك." });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.guard.rpc).toHaveBeenCalledTimes(1);
  });

  it("a wrong password is recorded and gets the same message as an unknown account", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" } });
    expect(await signIn("a@b.test", "wrong")).toEqual({ ok: false, reason: "invalid", error: signInMessages.invalid });
    expect(mocks.guard!.rpc).toHaveBeenLastCalledWith("login_record", expect.objectContaining({ p_ok: false }));
  });

  it("a captcha, rate-limit or outage answer is not counted as a failed password", async () => {
    for (const [error, reason] of [[{ code: "captcha_failed", status: 400 }, "captcha"], [{ status: 429 }, "busy"], [{ status: 500 }, "unavailable"]] as const) {
      mocks.guard!.rpc.mockClear();
      mocks.signInWithPassword.mockResolvedValue({ error: { ...error, message: "x" } });
      expect(await signIn("a@b.test", "secret123")).toMatchObject({ ok: false, reason });
      expect(mocks.guard!.rpc).not.toHaveBeenCalledWith("login_record", expect.anything());
    }
    mocks.signInWithPassword.mockRejectedValue(new Error("network"));
    expect(await signIn("a@b.test", "secret123")).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("if the guard is not reachable (e.g. before the migration), sign-in still works", async () => {
    mocks.guard = { rpc: vi.fn(async () => ({ data: null, error: { code: "PGRST202" } })) };
    expect(await signIn("a@b.test", "secret123")).toEqual({ ok: true });
    mocks.guard = null;
    expect(await signIn("a@b.test", "secret123")).toEqual({ ok: true });
  });

  it("refuses empty or oversized input without asking anyone", async () => {
    for (const [login, password] of [["", "x"], ["a@b.test", ""], ["a".repeat(255), "x"], ["a@b.test", "x".repeat(201)]]) {
      expect(await signIn(login, password)).toMatchObject({ ok: false, reason: "invalid" });
    }
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("no IP header: no forwarded IP is sent and the attempt is recorded without one", async () => {
    mocks.headers = new Headers();
    await signIn("a@b.test", "secret123");
    expect(mocks.createServer).toHaveBeenCalledWith(undefined);
    expect(mocks.guard!.rpc).toHaveBeenLastCalledWith("login_record", expect.objectContaining({ p_ip: null, p_user_agent: null }));
  });
});

describe("every Supabase Auth call that needs a captcha token gets one", () => {
  it("password sign-in only goes through the server action; sign-up and the activation email pass the token", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : []; });
    const files = ["app", "components", "lib"].flatMap(walk);
    const calls = files.flatMap(file => [...readFileSync(file, "utf8").matchAll(/auth\.(signInWithPassword|signUp|signInWithOtp|signInWithSSO|signInAnonymously|resetPasswordForEmail|resend|signInWithWeb3)\(/g)].map(match => `${file}:${match[1]}`));
    expect(calls.sort()).toEqual(["app/login/actions.ts:signInWithPassword", "components/signup-form.tsx:signUp", "lib/activation.ts:signInWithOtp"]);
    expect(readFileSync("components/signup-form.tsx", "utf8")).toMatch(/captchaToken/);
    expect(readFileSync("lib/activation.ts", "utf8")).toMatch(/captchaToken/);
    expect(readFileSync("app/login/actions.ts", "utf8")).toMatch(/captchaToken/);
  });
});

describe("activation email with Turnstile", () => {
  it("passes the captcha token to signInWithOtp only when there is one", async () => {
    const { requestActivationEmail } = await import("../lib/activation");
    const signInWithOtp = vi.fn(async () => ({ error: null }));
    const client = () => ({ auth: { signInWithOtp, verifyOtp: vi.fn(), getUser: vi.fn() } });
    await requestActivationEmail(client, "new@school.test", "https://seersa.vercel.app", "tok");
    expect(signInWithOtp).toHaveBeenLastCalledWith({ email: "new@school.test", options: { shouldCreateUser: true, emailRedirectTo: "https://seersa.vercel.app/auth/setup", captchaToken: "tok" } });
    await requestActivationEmail(client, "new@school.test", "https://seersa.vercel.app");
    expect(signInWithOtp).toHaveBeenLastCalledWith({ email: "new@school.test", options: { shouldCreateUser: true, emailRedirectTo: "https://seersa.vercel.app/auth/setup" } });
  });
});
