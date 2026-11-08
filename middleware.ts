import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const finish = (result: NextResponse) => {
    response.cookies.getAll().forEach(cookie => result.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(header);
      if (value) result.headers.set(header, value);
    }
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return finish(new NextResponse("إعداد الخدمة غير مكتمل", { status: 503 }));
  }
  const supabase = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll(items, headers) {
      items.forEach(({ name, value }) => request.cookies.set(name, value));
      const previous = response;
      response = NextResponse.next({ request });
      previous.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
      for (const header of ["cache-control", "expires", "pragma"]) {
        const value = previous.headers.get(header);
        if (value) response.headers.set(header, value);
      }
      items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
    }
  }});
  // Verified access-token claims: checked locally when the project uses asymmetric signing keys,
  // otherwise supabase-js falls back to asking the Auth server, as getUser() did.
  const { data, error } = await supabase.auth.getClaims();
  if (request.nextUrl.pathname.startsWith("/dashboard") && (error || !data?.claims?.sub)) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    return finish(NextResponse.redirect(target));
  }
  return finish(response);
}
export const config = { matcher: ["/dashboard/:path*", "/login", "/auth/:path*"] };
