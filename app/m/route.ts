import { NextResponse, type NextRequest } from "next/server";

/** A short, memorable link for staff: /m opens «مهامي». */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/dashboard/my", request.url), 302);
}
