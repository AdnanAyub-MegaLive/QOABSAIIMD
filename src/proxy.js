import { NextResponse } from "next/server";

export function proxy(request) {
  const token = request.cookies.get("streamline_events_access")?.value;
  if (!token) {
    const login = new URL("/events-login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/events-management/:path*"],
};
