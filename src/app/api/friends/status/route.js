import { prisma } from "../../../../lib/prisma.js";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "../../../../lib/mobile-api.js";
import { friendPairKey, friendStatusFor } from "../../../../lib/friends.js";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const targetPublicId = new URL(request.url).searchParams.get("userId")?.trim();
    if (!targetPublicId) {
      const error = new Error("userId is required.");
      error.code = "VALIDATION_ERROR";
      throw error;
    }
    if (targetPublicId === user.publicId)
      return mobileJson({
        success: true,
        data: { status: "none", requestId: null },
      });
    const target = await prisma.user.findFirst({
      where: { publicId: targetPublicId, deletedAt: null },
      select: { id: true },
    });
    if (!target) throw new Error("USER_NOT_FOUND");
    const record = await prisma.friendRequest.findUnique({
      where: { pairKey: friendPairKey(user.id, target.id) },
    });
    return mobileJson({
      success: true,
      data: friendStatusFor(record, user.id),
    });
  } catch (error) {
    console.error("Friend status lookup failed", error);
    return mobileApiError(error, "FRIEND_STATUS_FAILED");
  }
}
