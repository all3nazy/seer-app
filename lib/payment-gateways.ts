import { timingSafeEqual } from "node:crypto";
import { fromHalalas } from "./payments";

/**
 * Gateway adapters. Each turns a gateway's webhook into a verified settlement, or null when the
 * event cannot be trusted. Only Moyasar is wired so far; the others plug in the same way once the
 * school has an account (their signature schemes differ, so they stay off until then).
 */
export type Settlement = { intent: string; ref: string; amount: number; succeeded: boolean; reason: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}
type MoyasarEvent = { type?: string; secret_token?: string; data?: { id?: string; status?: string; amount?: number; metadata?: { intent?: string }; source?: { message?: string } } };
/** Moyasar signs webhooks with the secret token configured in its dashboard. */
export function verifyMoyasarEvent(event: MoyasarEvent, secret: string): Settlement | null {
  if (!secret || typeof event?.secret_token !== "string" || !sameSecret(event.secret_token, secret)) return null;
  const data = event.data;
  const intent = data?.metadata?.intent;
  if (!data?.id || !intent || !uuid.test(intent) || typeof data.amount !== "number") return null;
  const succeeded = data.status === "paid" && event.type !== "payment_failed";
  return { intent, ref: data.id.slice(0, 120), amount: fromHalalas(data.amount), succeeded, reason: succeeded ? null : (data.source?.message ?? data.status ?? "failed").slice(0, 300) };
}
