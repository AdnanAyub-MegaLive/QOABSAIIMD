import { prisma } from "./prisma.js";
import { emitToAudioRoom } from "./realtime.js";
import { resolveUserPerks } from "./user-perks.js";
import { roomMemberDto } from "./audio-room-management.js";

export const roomVisibleDecorationCategories = new Set(["FRAMES", "BADGES", "CHAT_BOXES", "SEAT_STYLES", "USER_TAGS"]);

export async function syncRoomDecorations(user, category, origin, db = prisma) {
  if (!roomVisibleDecorationCategories.has(category)) return;
  const memberships = await db.audioRoomMember.findMany({
    where: { userId: user.id, socketCount: { gt: 0 }, audioRoom: { status: "LIVE" } },
    include: { user: { select: { id: true, publicId: true, name: true, profileImage: true, gender: true, dob: true, isOfficial: true } }, audioRoom: { include: { seats: { where: { occupantUserId: user.id } } } } },
  });
  if (!memberships.length) return;
  const perks = await resolveUserPerks([memberships[0].user], origin, ["FRAMES", "BADGES", "CHAT_BOXES", "BUSINESS_CARD", "RIDES", "TAIL_LIGHTS", "USER_TAGS", "SEAT_STYLES"]);
  for (const row of memberships) {
    const room = row.audioRoom;
    if (room.seats.length && globalThis.portalBroadcastAudioRoomSeats) await globalThis.portalBroadcastAudioRoomSeats(room, origin);
    if (perks.get(user.publicId)?.vipPrivileges?.includes("INVISIBLE_ENTRY")) continue;
    const roles = await db.audioRoomRole.findMany({ where: { audioRoomId: room.id, userId: user.id } });
    const member = roomMemberDto(row, room, roles, room.seats, perks);
    await emitToAudioRoom(room.roomId, "audio-room:member-updated", { success: true, data: { roomId: room.roomId, member } });
  }
}
