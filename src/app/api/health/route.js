import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "Access-Control-Allow-Origin": process.env.MOBILE_APP_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function publicBaseUrl(request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost || request.headers.get("host");
  const protocol = forwardedProtocol || url.protocol.replace(":", "");
  return (
    process.env.MOBILE_API_BASE_URL ||
    (host ? `${protocol}://${host}` : url.origin)
  ).replace(/\/$/, "");
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}

export async function GET(request) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const baseUrl = publicBaseUrl(request);
    return Response.json(
      {
        success: true,
        data: {
          status: "ready",
          apiBaseUrl: baseUrl,
          socketBaseUrl: baseUrl,
          socketPath: "/socket.io/",
          checkedAt: new Date().toISOString(),
        },
      },
      { headers },
    );
  } catch {
    return Response.json(
      {
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The portal is not ready to serve mobile requests.",
        },
      },
      { status: 503, headers },
    );
  }
}
