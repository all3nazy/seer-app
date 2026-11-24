import { supportEmail } from "./support";

/** One email as the Gmail bridge sends it (the database checks every field again). */
export type InboxIncoming = { gmail_id: string; thread_id: string; from_name: string | null; from_email: string; to: string | null; subject: string | null; body: string; attachments: { name: string; size: number }[]; received_at: string };
export type InboxRow = { id: string; thread_id: string; from_name: string | null; from_email: string; subject: string | null; preview: string; attachments: number; received_at: string; read_at: string | null; archived_at: string | null };
export type InboxMessage = { id: string; thread_id: string; from_name: string | null; from_email: string; to: string | null; subject: string | null; body: string; attachments: { name: string; size: number }[]; received_at: string; read_at: string | null; archived_at: string | null };

const id = /^[A-Za-z0-9_-]{1,64}$/;
const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : "";

/** The request body → at most 50 well-formed messages, or null when it is not a batch at all. */
export function inboxBatch(body: unknown): InboxIncoming[] | null {
  const list = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(list) || list.length > 50) return null;
  const out: InboxIncoming[] = [];
  for (const item of list as Record<string, unknown>[]) {
    if (!item || typeof item !== "object") continue;
    const gmail = text(item.gmail_id, 64), thread = text(item.thread_id, 64), from = text(item.from_email, 320).trim().toLowerCase();
    if (!id.test(gmail) || !id.test(thread) || !/^[^@\s]+@[^@\s]+$/.test(from)) continue;
    const files = Array.isArray(item.attachments) ? (item.attachments as Record<string, unknown>[]).slice(0, 20).map(file => ({ name: text(file?.name, 200) || "ملف", size: Math.max(0, Math.min(Number(file?.size) || 0, 1e9)) })) : [];
    out.push({ gmail_id: gmail, thread_id: thread, from_name: text(item.from_name, 200).trim() || null, from_email: from, to: text(item.to, 1000) || null,
      subject: text(item.subject, 500) || null, body: text(item.body, 50000), attachments: files, received_at: text(item.received_at, 40) });
  }
  return out;
}

/** Opens the conversation in the Seer Gmail account (the browser may hold several Google accounts). */
export function gmailThreadLink(thread: string, mailbox = supportEmail): string {
  return id.test(thread) ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(mailbox)}#all/${thread}` : `https://mail.google.com/mail/?authuser=${encodeURIComponent(mailbox)}`;
}

/** "Name <a@b>" from Gmail's From header → its two parts. */
export function splitSender(from: string): { name: string | null; email: string } {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return match ? { name: match[1].trim() || null, email: match[2].trim().toLowerCase() } : { name: null, email: from.trim().toLowerCase() };
}
