// Confirmation links are bearer credentials. Parse them in memory, never follow,
// log, persist or return the original URL. redirect_to is deliberately unused.
export const activationTypes = ["signup", "invite", "magiclink", "email", "recovery"] as const;
export type ActivationType = (typeof activationTypes)[number];
export type ActivationCredentials = { token_hash: string; type: ActivationType };
export class ActivationError extends Error {
  constructor(public readonly code: "invalid-link" | "configuration" | "verification" | "session" | "email-request") {
    super(code);
    this.name = "ActivationError";
  }
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
    if (error) throw new ActivationError("verification");
    const { data, error: userError } = await client.auth.getUser();
    if (userError || !data.user?.email_confirmed_at) throw new ActivationError("session");
  } catch (error) {
    if (error instanceof ActivationError) throw error;
    throw new ActivationError("verification");
  }
}
