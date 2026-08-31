import { MOBILE_API_VERSION, v1Json, v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const path = "/api/v1";
const methods = "GET, OPTIONS";

export function OPTIONS(request) {
  return v1Options(request, methods);
}

export async function GET(request) {
  return withV1Request(request, { path, methods }, ({ requestId }) =>
    v1Json(request, requestId, {
      success: true,
      data: {
        version: MOBILE_API_VERSION,
        releasedAt: "2026-08-30",
        authentication: { scheme: "Bearer", token: "portal mobile session token" },
        identity: {
          userId: "Server-managed portal public ID; approved verified hosts transition from USR-* to TLN-* with the same suffix.",
          roomId: "Permanent portal room public ID, always a string.",
          legacyMappings: "Legacy numeric IDs are migrated into a server-side mapping table; clients use portal public IDs after sign-in.",
        },
        pagination: { style: "cursor", parameters: ["cursor", "limit"], defaultLimit: 20, maximumLimit: 100 },
        responseEnvelope: {
          success: { success: true, data: {} },
          error: { success: false, error: { code: "MACHINE_READABLE_CODE", message: "Human-readable message" } },
        },
        endpoints: {
          auth: ["POST /api/v1/auth/login", "POST /api/v1/auth/register", "POST /api/v1/auth/google", "POST /api/v1/auth/password", "POST /api/v1/auth/refresh", "POST /api/v1/auth/logout", "GET /api/v1/auth/session"],
          user: ["PATCH /api/v1/users/me"],
          audioRooms: ["GET /api/v1/audio-rooms", "POST /api/v1/audio-rooms"],
          discovery: ["GET /api/v1/audio-rooms/discover", "GET /api/v1/audio-rooms/search"],
          wallet: ["GET /api/v1/wallet", "GET /api/v1/wallet/coin-packages", "GET /api/v1/wallet/transactions", "POST /api/v1/wallet/top-ups", "POST /api/v1/wallet/transfers", "GET /api/v1/wallet/withdrawals", "POST /api/v1/wallet/withdrawals"],
          gifts: ["GET /api/v1/gifts/catalog", "POST /api/v1/gifts/send"],
        },
        compatibility: {
          legacyBasePath: "/api",
          policy: "Existing /api mobile endpoints remain available during migration. New Android work must use /api/v1.",
        },
      },
    }),
  );
}
