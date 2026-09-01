import { prisma } from "@/lib/prisma";
import { mobileApiError, requireMobileUser } from "@/lib/mobile-api";
import { v1Json, v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/blocks";
const methods = "GET, POST, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }

export async function GET(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ requestId }) => {
    try {
      const user = await requireMobileUser(request);
      const records = await prisma.userBlock.findMany({
        where: { blockerId: user.id },
        include: { blocked: { select: { publicId: true, name: true, profileImage: true } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      return v1Json(request, requestId, {
        success: true,
        data: {
          blocks: records.map((record) => ({
            userId: record.blocked.publicId,
            name: record.blocked.name,
            profileImage: record.blocked.profileImage ?? null,
            createdAt: record.createdAt.toISOString(),
          })),
        },
      }, 200, methods);
    } catch (error) {
      return mobileApiError(error, "BLOCK_LIST_FAILED");
    }
  });
}

export async function POST(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ requestId }) => {
    try {
      const user = await requireMobileUser(request);
      const body = await request.json();
      const targetPublicId = String(body?.targetUserId ?? "").trim();
      if (!targetPublicId || targetPublicId === user.publicId) {
        const error = new Error("VALIDATION_ERROR");
        error.validationMessage = "targetUserId must identify another user.";
        throw error;
      }
      const target = await prisma.user.findFirst({
        where: { publicId: targetPublicId, deletedAt: null },
        select: { id: true, publicId: true },
      });
      if (!target) throw new Error("USER_NOT_FOUND");
      const record = await prisma.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId: user.id, blockedId: target.id } },
        update: {},
        create: { blockerId: user.id, blockedId: target.id },
      });
      return v1Json(request, requestId, {
        success: true,
        data: { userId: target.publicId, createdAt: record.createdAt.toISOString() },
      }, 201, methods);
    } catch (error) {
      return mobileApiError(error, "BLOCK_CREATE_FAILED");
    }
  });
}
