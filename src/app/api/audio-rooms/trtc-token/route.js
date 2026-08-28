import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";
import { issueTrtcAccess } from "@/lib/trtc-authorization";

export const runtime = "nodejs";

export function OPTIONS() {
  return mobileOptions();
}

export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    const body = await request.json().catch(() => ({}));
    const roomId = String(body?.roomId ?? "").trim();
    if (!roomId) {
      return mobileJson(
        { success: false, error: { code: "VALIDATION_ERROR", message: "roomId is required." } },
        400,
      );
    }

    const room = await prisma.audioRoom.findUnique({
      where: { roomId },
      select: {
        ownerId: true,
        status: true,
        isBlocked: true,
        joiningDisabled: true,
        seats: { where: { occupantUserId: user.id }, select: { id: true }, take: 1 },
      },
    });
    if (!room || room.status !== "LIVE" || room.isBlocked) {
      return mobileJson({ success: false, error: { code: "ROOM_UNAVAILABLE" } }, 404);
    }

    const isOwner = room.ownerId === user.id;
    if (room.joiningDisabled && !isOwner) {
      return mobileJson({ success: false, error: { code: "ROOM_OWNER_ONLY" } }, 403);
    }

    return mobileJson({
      success: true,
      data: issueTrtcAccess(user, roomId, isOwner || room.seats.length > 0),
    });
  } catch (error) {
    console.error("TRTC token issuance failed", error);
    if (error?.message === "TRTC_NOT_CONFIGURED") {
      return mobileJson(
        { success: false, error: { code: "TRTC_NOT_CONFIGURED", message: "TRTC is not configured on this server." } },
        503,
      );
    }
    return mobileApiError(error, "TRTC_TOKEN_FAILED");
  }
}
