import { createHash, timingSafeEqual } from "node:crypto";
import { fromHalalas } from "./payments";

/**
 * Gateway adapters. Each turns a gateway's webhook into a settlement for the database to check.
 * The event's secret is never compared here against a shared value: each school registers its own
 * webhook secret, stored hashed, and the database matches the event's hash against the school that
 * owns the payment. Test events, other currencies and amount mismatches never reach the ledger.
 */
export type Settlement = { intent: string; ref: string; amount: number; currency: string; live: boolean; succeeded: boolean; reason: string | null; tokenHash: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const secretHash = (secret: string) => createHash("sha256").update(secret, "utf8").digest("hex");
export function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}
type MoyasarEvent = { type?: string; live?: boolean; secret_token?: string; data?: { id?: string; status?: string; amount?: number; currency?: string; metadata?: { intent?: string }; source?: { message?: string } } };
/** Reads a Moyasar webhook. Moyasar includes the secret token configured in the school's dashboard. */
export function parseMoyasarEvent(event: MoyasarEvent): Settlement | null {
  if (typeof event?.secret_token !== "string" || event.secret_token.length < 8 || event.secret_token.length > 200) return null;
  const data = event.data;
  const intent = data?.metadata?.intent;
  if (!data?.id || !intent || !uuid.test(intent) || typeof data.amount !== "number" || !Number.isInteger(data.amount) || data.amount <= 0) return null;
  const succeeded = data.status === "paid" && event.type !== "payment_failed";
  return {
    intent, ref: String(data.id).slice(0, 120), amount: fromHalalas(data.amount), currency: String(data.currency ?? "").toUpperCase().slice(0, 3),
    live: event.live === true, succeeded, reason: succeeded ? null : String(data.source?.message ?? data.status ?? "failed").slice(0, 300), tokenHash: secretHash(event.secret_token),
  };
}
