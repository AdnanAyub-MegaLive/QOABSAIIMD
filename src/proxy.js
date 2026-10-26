import { NextResponse } from "next/server";

function publicOrigin(request) {
  const host = request.headers?.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers?.get("host");
  const protocol = request.headers?.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(request.url).protocol.replace(":", "");
  for (const value of [process.env.AUTH_URL, process.env.MOBILE_API_BASE_URL, host ? `${protocol}://${host}` : null, request.url]) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return url.origin;
    } catch { /* Try the next available origin. */ }
  }
  throw new Error("No valid public origin for Events login.");
}

export function proxy(request) {
  const token = request.cookies.get("streamline_events_access")?.value;
  if (!token) {
    // The Next proxy adapter requires an absolute Location, even for Response.
    const location = new URL("/events-login", publicOrigin(request));
    location.searchParams.set("next", request.nextUrl.pathname + (request.nextUrl.search || ""));
    const response = NextResponse.redirect(location, 307);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/events-management/:path*"],
};
