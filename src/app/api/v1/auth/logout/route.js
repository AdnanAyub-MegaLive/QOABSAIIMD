import { prisma } from "@/lib/prisma";
import { mobileApiError, requireMobileUser } from "@/lib/mobile-api";
import { clientIp, v1Json, v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/auth/logout";
const methods = "POST, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }

export async function POST(request) {
  return withV1Request(
    request,
    { path, methods, rateLimit: { limit: 12, windowMs: 60_000 } },
    async ({ requestId }) => {
      try {
        const user = await requireMobileUser(request);
        const loggedOutAt = new Date();
        const updated = await prisma.$transaction(async (tx) => {
          const record = await tx.user.update({
            where: { id: user.id },
            data: {
              sessionVersion: { increment: 1 },
              forcedLogoutAt: loggedOutAt,
            },
            select: { publicId: true, sessionVersion: true },
          });
          await tx.auditLog.create({
            data: {
              action: "MOBILE_SESSION_LOGGED_OUT",
              category: "AUTHENTICATION",
              entityType: "User",
              entityId: record.publicId,
              description: `User ${record.publicId} logged out of all portal sessions.`,
              ipAddress: clientIp(request),
              metadata: { source: "MOBILE_API_V1", requestId },
            },
          });
          return record;
        });

        globalThis.portalDisconnectUser?.(updated.publicId);
        return v1Json(request, requestId, {
          success: true,
          data: {
            loggedOutAt: loggedOutAt.toISOString(),
            sessionVersion: updated.sessionVersion,
            scope: "ALL_PORTAL_SESSIONS",
          },
        }, 200, methods);
      } catch (error) {
        return mobileApiError(error, "LOGOUT_FAILED");
      }
    },
  );
}
