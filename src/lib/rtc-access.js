import { prisma } from "./prisma.js";
import { activeRoomBan } from "./audio-room-management.js";
import { issueTrtcAccess } from "./trtc-authorization.js";
import { issueLiveKitAccess } from "./livekit-authorization.js";
import { rtcProvider } from "./rtc-provider.js";

// Membership must come from a live authenticated socket, not stale database presence.
export async function requireRtcMembership(user, channel) {
  const sockets = await globalThis.portalIo?.in(`user:${user.publicId}`).fetchSockets();
  if (!sockets?.some(socket => socket.rooms.has(channel))) throw new Error("RTC_ROOM_JOIN_REQUIRED");
}

export async function audioRtcAccess(user, roomId, publishCeiling = true) {
  if (!user?.id || !user?.publicId) throw new Error("RTC_INVALID_IDENTITY");
  const room = await prisma.audioRoom.findUnique({ where: { roomId }, include: { seats: { where: { occupantUserId: user.id }, take: 1 } } });
  if (!room || !["LIVE", "IDLE"].includes(room.status) || room.isBlocked) throw new Error("ROOM_UNAVAILABLE");
  if (await activeRoomBan(room.id, user.id)) throw new Error("ROOM_BANNED");
  await requireRtcMembership(user, `audio-room:${roomId}`);
  const seat = room.seats[0];
  const canPublish = publishCeiling && (room.ownerId === user.id || Boolean(seat && !seat.isForceMuted && !seat.isMuted));
  return rtcProvider() === "TRTC" ? issueTrtcAccess(user, roomId, canPublish) : issueLiveKitAccess(user, roomId, canPublish);
}
