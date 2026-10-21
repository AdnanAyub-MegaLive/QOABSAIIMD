import { NextResponse } from "next/server";

export function proxy(request) {
  const token = request.cookies.get("streamline_events_access")?.value;
  if (!token) {
    const query = new URLSearchParams({ next: request.nextUrl.pathname });
    return new Response(null, {
      status: 307,
      headers: { Location: `/events-login?${query}`, "Cache-Control": "no-store" },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/events-management/:path*"],
};
