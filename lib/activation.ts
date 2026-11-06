// Confirmation links are bearer credentials. Parse them in memory, never follow,
// log, persist or return the original URL. redirect_to is deliberately unused.
export const activationTypes = ["signup", "invite", "magiclink", "email", "recovery"] as const;
export type ActivationType = (typeof activationTypes)[number];
export type ActivationCredentials = { token_hash: string; type: ActivationType };
export class ActivationError extends Error {
  constructor(public readonly code: "invalid-link" | "configuration" | "verification" | "session" | "email-request" | "expired-link") {
    super(code);
    this.name = "ActivationError";
  }
}
function activationVerificationError(error: unknown): ActivationError {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return new ActivationError(typeof code === "string" && ["otp_expired", "refresh_token_not_found", "refresh_token_already_used", "session_expired", "session_not_found"].includes(code) ? "expired-link" : "verification");
}
export function parseActivationLink(input: string, projectUrl: string | undefined): ActivationCredentials {
  let expected: URL;
  try {
    if (!projectUrl) throw new Error();
    expected = new URL(projectUrl);
    if (expected.protocol !== "https:" || expected.username || expected.password) throw new Error();
  } catch {
    throw new ActivationError("configuration");
  }
  let link: URL;
  try {
    if (!input.trim() || input.length > 8192) throw new Error();
    link = new URL(input.trim());
  } catch {
    throw new ActivationError("invalid-link");
  }
  if (link.origin !== expected.origin || link.pathname !== "/auth/v1/verify" || link.username || link.password || link.hash) {
    throw new ActivationError("invalid-link");
  }
  const hashes = link.searchParams.getAll("token_hash");
  const tokens = link.searchParams.getAll("token");
  const types = link.searchParams.getAll("type");
  if (hashes.length + tokens.length !== 1 || types.length !== 1) throw new ActivationError("invalid-link");
  const tokenHash = hashes[0] ?? tokens[0];
  const type = types[0];
  if (!tokenHash || !/^[A-Za-z0-9_-]{16,2048}$/.test(tokenHash) || !activationTypes.some(value => value === type)) {
    throw new ActivationError("invalid-link");
  }
  return { token_hash: tokenHash, type: type as ActivationType };
}

type ActivationAuth = {
  signInWithOtp: (params: { email: string; options: { shouldCreateUser: true; emailRedirectTo: string } }) => PromiseLike<{ error: unknown }>;
  verifyOtp: (params: ActivationCredentials) => PromiseLike<{ error: unknown }>;
  getUser: () => PromiseLike<{ data: { user: { email_confirmed_at?: string } | null }; error: unknown }>;
};
type ActivationClient = { auth: ActivationAuth };

export async function requestActivationEmail(createClient: () => ActivationClient, email: string, siteOrigin: string): Promise<void> {
  const normalized = email.trim();
  let redirect: URL;
  try {
    const origin = new URL(siteOrigin);
    if (origin.origin !== siteOrigin || !["http:", "https:"].includes(origin.protocol) || origin.username || origin.password) throw new Error();
    redirect = new URL("/auth/setup", origin);
  } catch { throw new ActivationError("configuration"); }
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new ActivationError("email-request");
  try {
    const { error } = await createClient().auth.signInWithOtp({ email: normalized, options: { shouldCreateUser: true, emailRedirectTo: redirect.href } });
    if (error) throw new ActivationError("email-request");
  } catch { throw new ActivationError("email-request"); }
}

export async function verifyActivationLink(createClient: () => ActivationClient, input: string, projectUrl: string | undefined): Promise<void> {
  const credentials = parseActivationLink(input, projectUrl);
  try {
    const client = createClient();
    const { error } = await client.auth.verifyOtp(credentials);
    if (error) throw activationVerificationError(error);
    const { data, error: userError } = await client.auth.getUser();
    if (userError || !data.user?.email_confirmed_at) throw new ActivationError("session");
  } catch (error) {
    if (error instanceof ActivationError) throw error;
    throw new ActivationError("verification");
  }
}

export type ActivationCallback = { access_token: string; refresh_token: string; type: ActivationType };
export function parseActivationCallback(input: string, siteOrigin: string): ActivationCallback {
  let expected: URL;
  try {
    expected = new URL(siteOrigin);
    if (expected.origin !== siteOrigin || !["https:", "http:"].includes(expected.protocol) || expected.username || expected.password) throw new Error();
  } catch { throw new ActivationError("configuration"); }
  let callback: URL;
  try {
    if (!input.trim() || input.length > 8192) throw new Error();
    callback = new URL(input.trim());
  } catch { throw new ActivationError("invalid-link"); }
  // The localhost destination is the known legacy SiteURL, not an arbitrary
  // localhost address. We never contact either destination or decode JWT claims.
  if (![expected.origin, "http://localhost:3000"].includes(callback.origin)
    || !["/", "/auth/setup"].includes(callback.pathname)
    || callback.username || callback.password) throw new ActivationError("invalid-link");
  const fragment = new URLSearchParams(callback.hash.slice(1));
  const forbidden = ["error", "error_code", "error_description", "error_uri"];
  if (forbidden.some(key => callback.searchParams.has(key) || fragment.has(key))
    || ["access_token", "refresh_token", "type", "token", "token_hash"].some(key => callback.searchParams.has(key))) {
    throw new ActivationError("invalid-link");
  }
  const access = fragment.getAll("access_token");
  const refresh = fragment.getAll("refresh_token");
  const types = fragment.getAll("type");
  if (access.length !== 1 || refresh.length !== 1 || types.length !== 1
    || !/^[^\s]{8,6144}$/.test(access[0]) || !/^[^\s]{8,6144}$/.test(refresh[0])
    || !activationTypes.some(value => value === types[0])) throw new ActivationError("invalid-link");
  return { access_token: access[0], refresh_token: refresh[0], type: types[0] as ActivationType };
}

type CallbackClient = ActivationClient & { auth: ActivationAuth & {
  setSession: (params: { access_token: string; refresh_token: string }) => PromiseLike<{ error: unknown }>;
} };
export async function verifyActivationInput(createClient: () => CallbackClient, input: string, projectUrl: string | undefined, siteOrigin: string): Promise<void> {
  let callback: ActivationCallback;
  try {
    callback = parseActivationCallback(input, siteOrigin);
  } catch (error) {
    if (!(error instanceof ActivationError) || error.code !== "invalid-link") throw error;
    // Original, unconsumed Supabase confirmation links keep their existing flow.
    return verifyActivationLink(createClient, input, projectUrl);
  }
  try {
    const client = createClient();
    const { error } = await client.auth.setSession({ access_token: callback.access_token, refresh_token: callback.refresh_token });
    if (error) throw activationVerificationError(error);
    const { data, error: userError } = await client.auth.getUser();
    if (userError || !data.user?.email_confirmed_at) throw new ActivationError("session");
  } catch (error) {
    if (error instanceof ActivationError) throw error;
    throw new ActivationError("verification");
  }
}
