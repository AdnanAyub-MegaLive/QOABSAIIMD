import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";
import { issueLiveKitAccess } from "@/lib/livekit-speaker-authorization";

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
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "roomId is required.",
          },
        },
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
        seats: {
          where: { occupantUserId: user.id },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!room || room.status !== "LIVE" || room.isBlocked) {
      return mobileJson(
        { success: false, error: { code: "ROOM_UNAVAILABLE" } },
        404,
      );
    }

    const isOwner = room.ownerId === user.id;
    if (room.joiningDisabled && !isOwner) {
      return mobileJson(
        { success: false, error: { code: "ROOM_OWNER_ONLY" } },
        403,
      );
    }

    const canPublish = isOwner || room.seats.length > 0;
    const liveKit = await issueLiveKitAccess(user, roomId, canPublish);

    return mobileJson({
      success: true,
      data: {
        ...liveKit,
      },
    });
  } catch (error) {
    console.error("LiveKit token issuance failed", error);
    if (error?.message === "LIVEKIT_NOT_CONFIGURED")
      return mobileJson(
        {
          success: false,
          error: {
            code: "LIVEKIT_NOT_CONFIGURED",
            message: "Live audio is not configured on this server.",
          },
        },
        503,
      );
    return mobileApiError(error, "LIVEKIT_TOKEN_FAILED");
  }
}
