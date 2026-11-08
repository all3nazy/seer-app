import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type Job = { subscriptions: { endpoint: string; p256dh: string; auth: string }[]; title: string; body: string | null; url: string | null; public_key: string; private_key: string };
/**
 * Called by the database with a one-time job code when a notification is created. The code is
 * claimed once (valid a few minutes) and returns the devices to reach and the push keys.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { nonce?: unknown } | null;
  const nonce = typeof body?.nonce === "string" && /^[A-Za-z0-9]{43}$/.test(body.nonce) ? body.nonce : null;
  if (!nonce) return NextResponse.json({ error: "Invalid job" }, { status: 400 });
  const client = await createSupabaseServerClient();
  const { data } = await client.rpc("claim_push_job", { nonce });
  const job = data as Job | null;
  if (!job?.subscriptions?.length || !job.private_key) return NextResponse.json({ sent: 0 });
  webpush.setVapidDetails("mailto:support@seer.app", job.public_key, job.private_key);
  const payload = JSON.stringify({ title: job.title, body: job.body ?? "", url: typeof job.url === "string" && job.url.startsWith("/") ? job.url : "/dashboard" });
  const results = await Promise.allSettled(job.subscriptions.slice(0, 20).map(item => webpush.sendNotification({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } }, payload, { TTL: 60 * 60 * 12 })));
  return NextResponse.json({ sent: results.filter(result => result.status === "fulfilled").length });
}

/** One-time setup: the server generates its push keys and stores them with a bootstrap token. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("init") ?? "";
  if (!/^[A-Za-z0-9]{32,64}$/.test(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const keys = webpush.generateVAPIDKeys();
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("init_push_keys", { token, public_key: keys.publicKey, private_key: keys.privateKey });
  if (error) return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  return NextResponse.json({ configured: data === true ? "created" : "already" });
}
