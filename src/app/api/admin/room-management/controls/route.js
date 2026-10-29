import { requirePermission } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import { applyPortalRoomControl } from "@/lib/portal-room-controls";
import { permissionsForRole } from "@/lib/audio-room-management";
import { readAudioRoomSeatState } from "@/lib/audio-room-seats";
import { updateRtcPublishPermission } from "@/lib/rtc-moderation";
import { emitToAudioRoom, emitToUser } from "@/lib/realtime";
import { requestOrigin } from "@/lib/user-perks";

export async function POST(request) {
  let result;
  try {
    const admin = await requirePermission("rooms.manage");
    let body;
    try { body = await request.json(); } catch { return Response.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid JSON request." } }, { status: 422 }); }
    if (!globalThis.portalIo || !globalThis.portalRemoveFromAudioRoom || !globalThis.portalSyncAudioRoomRemoval)
      return Response.json({ success: false, error: { code: "REALTIME_UNAVAILABLE", message: "Room controls are temporarily unavailable. Try again shortly." } }, { status: 503 });
    result = await applyPortalRoomControl(prisma, admin, body ?? {});
  } catch (error) {
    if (!error.status) console.error("Portal room control failed", { code: error.code });
    return Response.json({ success: false, error: { code: error.status ? error.code : "ROOM_CONTROL_FAILED", message: error.status ? error.message : "Unable to update this room. Refresh and try again." } }, { status: error.status ?? 500 });
  }
  const { room, target, action, reason, expiresAt } = result;
  const warnings = [];
  async function deliver(fn) { try { await fn(); } catch { warnings.push("Live enforcement could not be confirmed. Refresh and retry the action."); } }
  if (action.endsWith("ADMIN")) {
    const role = action === "GRANT_ADMIN" ? "ADMIN" : "MEMBER";
    const payload = { success: true, data: { eventId: crypto.randomUUID(), roomId: room.roomId, userId: target.publicId, role, permissions: permissionsForRole(role), revision: room.revision, updatedAt: room.updatedAt.toISOString() } };
    await deliver(() => emitToAudioRoom(room.roomId, "audio-room:permissions-changed", payload));
    await deliver(() => emitToUser(target.publicId, "audio-room:permissions-changed", payload));
  } else {
    await deliver(() => updateRtcPublishPermission(room.roomId, target.publicId, action === "ALLOW_MIC"));
    if (["KICK", "BAN"].includes(action)) {
      await deliver(() => globalThis.portalRemoveFromAudioRoom(target.publicId, room.roomId, { code: action === "BAN" ? "ROOM_BANNED" : "ROOM_KICKED", message: "You were removed from this room.", details: { reason, expiresAt: expiresAt?.toISOString() ?? null } }));
      await deliver(() => globalThis.portalSyncAudioRoomRemoval(room.roomId, target.publicId, requestOrigin(request)));
    } else {
      await deliver(async () => {
        const seatState = await readAudioRoomSeatState(room, requestOrigin(request));
        await emitToAudioRoom(room.roomId, "audio-room:seat-update", { success: true, data: seatState });
        await emitToUser(target.publicId, action === "SEAT_KICK" ? "audio-room:seat-kicked" : "audio-room:seat-force-muted", { success: true, data: { roomId: room.roomId, userId: target.publicId, muted: action === "FORCE_MUTE", expiresAt: null, seatState } });
      });
    }
  }
  return Response.json({ success: true, data: { roomId: room.roomId, publicId: target.publicId, action, warnings } }, { headers: { "Cache-Control": "no-store" } });
}
