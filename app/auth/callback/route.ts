import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

/**
 * The link in the verification email lands here: the session is started, and a pending sign-up
 * becomes an organization with its owner and a trial. Then on to the dashboard.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const target = new URL(next && /^\/dashboard(\/[\w/-]*)?$/.test(next) ? next : "/dashboard", request.url);
  if (!code) return NextResponse.redirect(new URL("/login", request.url));
  const client = await createSupabaseServerClient();
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?verified=1", request.url));
  await client.rpc("complete_signup");
  return NextResponse.redirect(target);
}
