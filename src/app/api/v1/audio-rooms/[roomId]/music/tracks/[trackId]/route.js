import { requireRoomPermission } from "@/lib/audio-room-management";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";
import { emitToAudioRoom } from "@/lib/realtime";

export function OPTIONS() {
  return mobileOptions();
}

export async function DELETE(request, { params }) {
  try {
    const user = await requireMobileUser(request);
    const { roomId, trackId } = await params;
    const room = await prisma.audioRoom.findUnique({ where: { roomId: decodeURIComponent(roomId) }, include: { entertainmentState: true } });
    if (!room) throw new Error("ROOM_UNAVAILABLE");
    await requireRoomPermission(room, user.id, "canManageMusic");
    const track = await prisma.uploadAsset.findFirst({ where: { publicId: decodeURIComponent(trackId), audioRoomId: room.id, category: "MUSIC_TRACKS", isGlobal: false }, select: { id: true, publicId: true } });
    if (!track) throw Object.assign(new Error("The selected catalog track is unavailable."), { code: "MUSIC_TRACK_NOT_FOUND" });
    const selected = room.entertainmentState?.music?.catalogTrackId === track.publicId;
    const result = await prisma.$transaction(async (tx) => {
      await tx.uploadAsset.delete({ where: { id: track.id } });
      if (!selected) return null;
      return tx.audioRoomEntertainmentState.update({ where: { audioRoomId: room.id }, data: { music: { ...room.entertainmentState.music, status: "STOPPED", positionSeconds: 0, startedAt: null, unavailable: true }, revision: { increment: 1 }, updatedById: user.id } });
    });
    const data = { roomId: room.roomId, trackId: track.publicId, removed: true };
    if (result) emitToAudioRoom(room.roomId, "audio-room:music-changed", { success: true, data: { roomId: room.roomId, status: "STOPPED", positionSeconds: 0, startedAt: null, revision: result.revision, reason: "TRACK_DELETED", changedBy: { publicId: user.publicId } } });
    return mobileJson({ success: true, data });
  } catch (error) {
    return mobileApiError(error, "ROOM_MUSIC_DELETE_FAILED");
  }
}
