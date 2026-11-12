import { legacyHosts } from "./canonical";

/**
 * Links in support messages: only the platform's own pages become clickable (the official address,
 * the old addresses, the address the page is open on, or a path like /dashboard/team). Any other
 * address stays plain text. A platform link opens as a path on the current address.
 */
export const officialHost = "seersa.vercel.app";
export type Piece = { text: string; href?: string };

const candidate = /https?:\/\/[^\s<>"'«»]+|(?<![\w/.:])\/(?:dashboard|admin|invite|settings)(?:[/?#][^\s<>"'«»]*)?/g;
const trailing = /[.,،؛;:!?؟)\]}»'"]+$/;

export function platformPath(raw: string, currentHost: string | null = null): string | null {
  if (raw.startsWith("/")) return /^\/(dashboard|admin|invite|settings)([/?#]|$)/.test(raw) ? raw : null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.host.toLowerCase();
  const hosts = [officialHost, ...legacyHosts, ...(currentHost ? [currentHost.toLowerCase()] : [])];
  if (!hosts.includes(host)) return null;
  return `${url.pathname}${url.search}${url.hash}` || "/";
}

export function linkify(text: string, currentHost: string | null = null): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const match of text.matchAll(candidate)) {
    const start = match.index ?? 0;
    const raw = match[0].replace(trailing, "");
    const href = platformPath(raw, currentHost);
    if (!href) continue;
    if (start > last) pieces.push({ text: text.slice(last, start) });
    pieces.push({ text: raw, href });
    last = start + raw.length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last) });
  return pieces.length ? pieces : [{ text }];
}
