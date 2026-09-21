import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { issueLiveKitAccess } from "@/lib/livekit-authorization";

export const runtime = "nodejs";

export function OPTIONS() { return mobileOptions(); }

export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    const body = await request.json().catch(() => ({}));
    const roomId = String(body?.roomId ?? "").trim();
    if (!roomId) {
      return mobileJson({ success: false, error: { code: "VALIDATION_ERROR", message: "roomId is required." } }, 422);
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
      return mobileJson({ success: false, error: { code: "ROOM_UNAVAILABLE", message: "This room is unavailable." } }, 404);
    }
    const isOwner = room.ownerId === user.id;
    if (room.joiningDisabled && !isOwner) {
      return mobileJson({ success: false, error: { code: "ROOM_OWNER_ONLY", message: "This room is not accepting listeners." } }, 403);
    }
    const liveKit = await issueLiveKitAccess(user, roomId, isOwner || room.seats.length > 0);
    return mobileJson({ success: true, data: { liveKit } });
  } catch (error) {
    if (error?.message === "LIVEKIT_NOT_CONFIGURED") {
      return mobileJson({ success: false, error: { code: "LIVEKIT_NOT_CONFIGURED", message: "LiveKit is not configured on this server." } }, 503);
    }
    console.error("LiveKit token issuance failed", error);
    return mobileApiError(error, "LIVEKIT_TOKEN_FAILED");
  }
}
