import { prisma } from "./prisma.js";
import { activeRoomBan } from "./audio-room-management.js";
import { issueTrtcAccess } from "./trtc-authorization.js";
import { issueLiveKitAccess } from "./livekit-authorization.js";
import { rtcProvider } from "./rtc-provider.js";
import { createRtcTicketCache } from "./rtc-ticket-cache.js";
import { updateRtcPublishPermission } from "./rtc-moderation.js";
const cachedTicket=createRtcTicketCache();

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
  // A TRTC seat grants publisher capability; self-mute is local audio state.
  // Forced mute still denies tickets and moderation still evicts the publisher.
  const canPublish = publishCeiling && (seat ? !seat.isForceMuted && (rtcProvider()==="TRTC" || !seat.isMuted) : room.ownerId === user.id);
  if(rtcProvider()!=="TRTC")return issueLiveKitAccess(user, roomId, canPublish);
  return cachedTicket(`${process.env.TRTC_SDK_APP_ID}:${user.id}:${user.sessionVersion}:${roomId}:${room.startedAt?.getTime?.()??""}:${canPublish}`,()=>issueTrtcAccess(user, roomId, canPublish));
}

// Only for the authenticated occupant's seat-status action, never moderation.
export async function selfSeatRtcStatus(user, roomId, muted) {
  if (muted === undefined) return null;
  if (rtcProvider() !== "TRTC") {
    await updateRtcPublishPermission(roomId, user.publicId, !muted);
    return null;
  }
  if (muted) return null; // Do not disconnect a listener when they stop publishing.
  const ticket = await audioRtcAccess(user, roomId, true);
  globalThis.portalIo?.to(`user:${user.publicId}`).emit("rtc:credentials-invalidated", {
    success: true, data: { provider: "TRTC", roomId, reconnect: false },
  });
  return ticket;
}
