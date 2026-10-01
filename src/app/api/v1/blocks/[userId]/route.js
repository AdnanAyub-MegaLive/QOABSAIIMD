import { prisma } from "@/lib/prisma";
import { mobileApiError, requireMobileUser } from "@/lib/mobile-api";
import { v1Json, v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/blocks/:userId";
const methods = "DELETE, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }
export async function DELETE(request, { params }) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ requestId }) => {
    try {
      const user = await requireMobileUser(request);
      const { userId } = await params;
      const target = await prisma.user.findFirst({
        where: { publicId: decodeURIComponent(userId) },
        select: { id: true, publicId: true },
      });
      if (!target) throw new Error("USER_NOT_FOUND");
      await prisma.userBlock.deleteMany({ where: { blockerId: user.id, blockedId: target.id } });
      return v1Json(request, requestId, { success: true, data: { userId: target.publicId, unblocked: true } }, 200, methods);
    } catch (error) {
      return mobileApiError(error, "BLOCK_DELETE_FAILED");
    }
  });
}
