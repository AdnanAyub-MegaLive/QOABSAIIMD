import { prisma } from "@/lib/prisma";
import mobileSession from "@/lib/mobile-session.cjs";
import { mobileApiError, requireMobileUser } from "@/lib/mobile-api";
import { clientIp, v1Json, v1Options, withV1Request } from "@/lib/mobile-v1";
import { mobileUserProfile } from "@/lib/mobile-user-profile";
import { requestOrigin } from "@/lib/user-perks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/auth/refresh";
const methods = "POST, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }

export async function POST(request) {
  return withV1Request(
    request,
    { path, methods, rateLimit: { limit: 12, windowMs: 60_000 } },
    async ({ requestId }) => {
      try {
        const user = await requireMobileUser(request);
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const payload = mobileSession.verifyMobileSessionToken(token);
        if (!payload.deviceId) {
          return v1Json(request, requestId, {
            success: false,
            error: {
              code: "DEVICE_REAUTH_REQUIRED",
              message: "Sign in again to associate this session with the current device.",
            },
          }, 401, methods);
        }

        await prisma.auditLog.create({
          data: {
            action: "MOBILE_SESSION_REFRESHED",
            category: "AUTHENTICATION",
            entityType: "User",
            entityId: user.publicId,
            description: `User ${user.publicId} refreshed a mobile session.`,
            ipAddress: clientIp(request),
            metadata: { source: "MOBILE_API_V1", deviceId: payload.deviceId, requestId },
          },
        });

        const session = mobileSession.createMobileSession(user, {
          deviceId: payload.deviceId,
        });
        const profile = await mobileUserProfile(user.id, requestOrigin(request));
        return v1Json(request, requestId, {
          success: true,
          data: {
            ...session,
            user: profile,
          },
        }, 200, methods);
      } catch (error) {
        return mobileApiError(error, "SESSION_REFRESH_FAILED");
      }
    },
  );
}
