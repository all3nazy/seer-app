import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

/** Short links (/s/CODE) open the private page they stand for. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Za-z0-9]{10}$/.test(code)) return new NextResponse("الرابط غير صحيح.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const client = await createSupabaseServerClient();
  const { data } = await client.rpc("resolve_short", { link: code });
  const path = typeof data === "string" && /^\/(d|p|c)\/[0-9a-f-]{36}$/.test(data) ? data : null;
  if (!path) return new NextResponse("انتهت صلاحية الرابط أو أنه غير صحيح.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return NextResponse.redirect(new URL(path, request.url), { status: 302, headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
}
