import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";
import { requireRoomPermission } from "@/lib/audio-room-management";
import { emitToAudioRoom } from "@/lib/realtime";
export function OPTIONS() {
  return mobileOptions();
}
export async function POST(request, { params }) {
  try {
    const actor = await requireMobileUser(request),
      { roomId } = await params,
      body = await request.json();
    const room = await prisma.audioRoom.findUnique({
      where: { roomId: decodeURIComponent(roomId) },
      select: { id: true, roomId: true, ownerId: true },
    });
    if (!room) throw new Error("ROOM_UNAVAILABLE");
    await requireRoomPermission(room, actor.id, "canManagePrivacy");
    const paused = Boolean(body.paused),
      minutes =
        body.durationMinutes == null ? null : Number(body.durationMinutes);
    if (
      paused &&
      minutes !== null &&
      (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 10080)
    )
      throw Object.assign(
        new Error("durationMinutes must be 1 to 10080 or null."),
        { code: "VALIDATION_ERROR" },
      );
    const until =
      paused && minutes ? new Date(Date.now() + minutes * 60000) : null;
    const updated = await prisma.audioRoom.update({
      where: { id: room.id },
      data: {
        joiningDisabled: paused,
        joiningDisabledUntil: until,
        revision: { increment: 1 },
      },
      select: { revision: true, updatedAt: true },
    });
    const data = {
      roomId: room.roomId,
      paused,
      expiresAt: until?.toISOString() ?? null,
      revision: updated.revision,
      updatedAt: updated.updatedAt.toISOString(),
    };
    if (until)
      globalThis.portalScheduleAudioRoomRestriction?.(
        room.roomId,
        "DISABLE_JOINING",
        until,
      );
    emitToAudioRoom(
      room.roomId,
      paused ? "audio-room:joining-disabled" : "audio-room:joining-enabled",
      { success: true, data },
    );
    return mobileJson({ success: true, data });
  } catch (e) {
    return mobileApiError(e, "ROOM_JOINING_UPDATE_FAILED");
  }
}
