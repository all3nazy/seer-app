import { headers } from "next/headers";

/** The site's public origin for links sent outside the app. */
export async function siteOrigin(): Promise<string> {
  const head = await headers();
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "seer-app-psi.vercel.app";
  const proto = head.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
