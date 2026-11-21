import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "../../../../lib/supabase/service";
import { sameSecret } from "../../../../lib/payment-gateways";
import { runBackup } from "../../../../lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The daily backup (Vercel Cron on the subscriber platform project, see vercel.json). Vercel sends
 * "Authorization: Bearer <CRON_SECRET>". The database allows one good daily run per day.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !sameSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = serviceClient();
  if (!client) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const { data: run, error } = await client.rpc("backup_begin", { p_kind: "daily" });
  if (error) return NextResponse.json({ error: error.code === "54000" ? "A backup is running" : "Could not start" }, { status: error.code === "54000" ? 409 : 500 });
  if (run === null) return NextResponse.json({ skipped: "already done today" });
  const folder = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const result = await runBackup(client, run as number, folder);
  return NextResponse.json(result.ok ? { ok: true, folder, tables: result.manifest?.tables, rows: result.manifest?.rows, bytes: result.manifest?.bytes } : { ok: false, error: "backup failed" }, { status: result.ok ? 200 : 500 });
}
