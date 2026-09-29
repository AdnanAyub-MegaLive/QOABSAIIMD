import { requireRoomPermission } from "@/lib/audio-room-management";
import { issueLiveKitMusicAccess } from "@/lib/livekit-authorization";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export function OPTIONS() {
  return mobileOptions();
}

export async function POST(request, { params }) {
  try {
    const user = await requireMobileUser(request);
    const { roomId } = await params;
    const room = await prisma.audioRoom.findUnique({
      where: { roomId: decodeURIComponent(roomId) },
      select: { id: true, roomId: true, ownerId: true, status: true, isBlocked: true },
    });
    if (!room || room.status === "TERMINATED") throw new Error("ROOM_UNAVAILABLE");
    if (room.isBlocked) throw new Error("ROOM_BLOCKED");
    await requireRoomPermission(room, user.id, "canManageMusic");
    const sockets = globalThis.portalIo
      ? await globalThis.portalIo.in(`user:${user.publicId}`).fetchSockets()
      : [];
    if (!sockets.some((socket) => socket.rooms.has(`audio-room:${room.roomId}`))) {
      throw new Error("ROOM_MUSIC_JOIN_REQUIRED");
    }
    const liveKitMusic = await issueLiveKitMusicAccess(user, room.roomId);
    return mobileJson({ success: true, data: { liveKitMusic } });
  } catch (error) {
    return mobileApiError(error, "ROOM_MUSIC_TOKEN_FAILED");
  }
}
