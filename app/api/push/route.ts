import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { sameSecret } from "../../../lib/payment-gateways";

export const dynamic = "force-dynamic";

type Subscription = { endpoint: string; p256dh: string; auth: string };
/**
 * Sends a push notification to a person's devices. Called only by the database (pg_net) with the
 * shared secret, when a notification is created; the payload carries the devices to reach.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.PUSH_WEBHOOK_SECRET, publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!secret || !publicKey || !privateKey) return NextResponse.json({ error: "Push not configured" }, { status: 501 });
  if (!sameSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { subscriptions?: Subscription[]; title?: string; body?: string | null; url?: string | null } | null;
  const subscriptions = (body?.subscriptions ?? []).filter(item => typeof item?.endpoint === "string" && item.endpoint.startsWith("https://")).slice(0, 20);
  if (!body?.title || !subscriptions.length) return NextResponse.json({ sent: 0 });
  webpush.setVapidDetails("mailto:support@seer.app", publicKey, privateKey);
  const payload = JSON.stringify({ title: String(body.title).slice(0, 120), body: body.body ? String(body.body).slice(0, 300) : "", url: typeof body.url === "string" && body.url.startsWith("/") ? body.url : "/dashboard" });
  const results = await Promise.allSettled(subscriptions.map(item => webpush.sendNotification({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } }, payload, { TTL: 60 * 60 * 12, urgency: "normal" })));
  return NextResponse.json({ sent: results.filter(result => result.status === "fulfilled").length, failed: results.filter(result => result.status === "rejected").length });
}
