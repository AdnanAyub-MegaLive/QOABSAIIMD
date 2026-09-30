import { prisma } from "./prisma.js";
import { emitToAudioRoom, emitToVideoLive } from "./realtime.js";

export function pkWinner(leftScore, rightScore, leftId, rightId) {
  const left = BigInt(leftScore), right = BigInt(rightScore);
  return left === right ? null : left > right ? leftId : rightId;
}

export function socketUserCounts(sockets) {
  const counts = new Map();
  for (const socket of sockets) {
    const userId = String(socket?.data?.userId ?? "").trim();
    if (userId) counts.set(userId, (counts.get(userId) ?? 0) + 1);
  }
  return counts;
}

export async function reconcileAudioRoomPresence(io, now = new Date()) {
  if (!io) return { rooms: 0, corrected: 0 };
  const rooms = await prisma.audioRoom.findMany({
    where: { OR: [{ participantCount: { gt: 0 } }, { members: { some: { socketCount: { gt: 0 } } } }] },
    select: { id: true, roomId: true, participantCount: true, revision: true },
  });
  let corrected = 0;
  for (const room of rooms) {
    const sockets = await io.in(`audio-room:${room.roomId}`).fetchSockets();
    const counts = socketUserCounts(sockets);
    const connectedPublicIds = [...counts.keys()];
    const connectedUsers = connectedPublicIds.length
      ? await prisma.user.findMany({ where: { publicId: { in: connectedPublicIds } }, select: { id: true, publicId: true } })
      : [];
    const userByPublicId = new Map(connectedUsers.map((user) => [user.publicId, user.id]));
    const current = await prisma.audioRoomMember.findMany({ where: { audioRoomId: room.id, socketCount: { gt: 0 } }, select: { userId: true, socketCount: true } });
    const desired = new Map(connectedPublicIds.map((publicId) => [userByPublicId.get(publicId), counts.get(publicId)]).filter(([userId]) => userId));
    const changed = current.some((member) => member.socketCount !== (desired.get(member.userId) ?? 0)) || [...desired].some(([userId, count]) => !current.some((member) => member.userId === userId && member.socketCount === count));
    const total = desired.size;
    if (!changed && room.participantCount === total) continue;
    await prisma.$transaction(async (tx) => {
      await tx.audioRoomMember.updateMany({ where: { audioRoomId: room.id, socketCount: { gt: 0 } }, data: { socketCount: 0, lastSeenAt: now } });
      for (const [userId, socketCount] of desired) await tx.audioRoomMember.upsert({ where: { audioRoomId_userId: { audioRoomId: room.id, userId } }, create: { audioRoomId: room.id, userId, socketCount, lastSeenAt: now }, update: { socketCount, lastSeenAt: now } });
      await tx.audioRoom.update({ where: { id: room.id }, data: { participantCount: total, revision: { increment: 1 } } });
    });
    corrected += 1;
    emitToAudioRoom(room.roomId, "audio-room:presence-snapshot", { success: true, data: { roomId: room.roomId, participantCount: total, revision: room.revision + 1, reconciledAt: now.toISOString() } });
  }
  return { rooms: rooms.length, corrected };
}

export async function finalizeExpiredPkSessions(now = new Date()) {
  const [audio, video] = await Promise.all([
    prisma.audioRoomPkSession.findMany({ where: { status: "LIVE", endsAt: { lte: now } }, include: { leftRoom: true, rightRoom: true } }),
    prisma.videoLivePkSession.findMany({ where: { status: "LIVE", endsAt: { lte: now } }, include: { leftSession: true, rightSession: true } }),
  ]);
  for (const pk of audio) {
    const winnerRoomId = pkWinner(pk.leftScore, pk.rightScore, pk.leftRoom.roomId, pk.rightRoom.roomId);
    const updated = await prisma.audioRoomPkSession.updateMany({ where: { id: pk.id, status: "LIVE" }, data: { status: "ENDED", endedAt: now, winnerRoomId, revision: { increment: 1 } } });
    if (updated.count) { const data = { id: pk.id, status: "ENDED", leftRoomId: pk.leftRoom.roomId, rightRoomId: pk.rightRoom.roomId, leftScore: pk.leftScore.toString(), rightScore: pk.rightScore.toString(), winnerRoomId, endedAt: now.toISOString(), revision: pk.revision + 1 }; emitToAudioRoom(pk.leftRoom.roomId, "audio-room:pk-changed", { success: true, data }); emitToAudioRoom(pk.rightRoom.roomId, "audio-room:pk-changed", { success: true, data }); }
  }
  for (const pk of video) {
    const winnerLiveId = pkWinner(pk.leftScore, pk.rightScore, pk.leftSession.publicId, pk.rightSession.publicId);
    const updated = await prisma.videoLivePkSession.updateMany({ where: { id: pk.id, status: "LIVE" }, data: { status: "ENDED", endedAt: now, winnerLiveId, revision: { increment: 1 } } });
    if (updated.count) { const data = { id: pk.id, status: "ENDED", leftLiveId: pk.leftSession.publicId, rightLiveId: pk.rightSession.publicId, leftScore: pk.leftScore.toString(), rightScore: pk.rightScore.toString(), winnerLiveId, endedAt: now.toISOString(), revision: pk.revision + 1 }; emitToVideoLive(pk.leftSession.publicId, "live-video:pk-changed", { success: true, data }); emitToVideoLive(pk.rightSession.publicId, "live-video:pk-changed", { success: true, data }); }
  }
  return { audio: audio.length, video: video.length };
}

export async function reconcileStaleVideoPresence(now = new Date(), staleMs = 90_000) {
  const cutoff = new Date(now.getTime() - staleMs);
  await prisma.videoLiveViewer.updateMany({ where: { active: true, socketCount: 0, lastSeenAt: { lt: cutoff } }, data: { active: false } });
  const lives = await prisma.videoLiveSession.findMany({ where: { status: "LIVE" }, select: { id: true, publicId: true, viewerCount: true } });
  for (const live of lives) {
    const viewerCount = await prisma.videoLiveViewer.count({ where: { sessionId: live.id, active: true } });
    if (viewerCount !== live.viewerCount) { const updated = await prisma.videoLiveSession.update({ where: { id: live.id }, data: { viewerCount, revision: { increment: 1 } }, select: { revision: true } }); emitToVideoLive(live.publicId, "live-video:presence-snapshot", { success: true, data: { liveId: live.publicId, viewerCount, revision: updated.revision } }); }
  }
}

export async function expireGuestRequests(now = new Date()) {
  return prisma.videoLiveGuestRequest.updateMany({ where: { status: "PENDING", expiresAt: { lte: now } }, data: { status: "EXPIRED", respondedAt: now } });
}

export async function reconcileExpiredAudioRoomControls(now = new Date()) {
  const [seats, members] = await Promise.all([
    prisma.audioRoomSeat.findMany({ where: { isForceMuted: true, forceMutedUntil: { lte: now } }, include: { occupant: { select: { publicId: true } }, audioRoom: { select: { id: true, roomId: true, seatLayout: true, seatRevision: true, updatedAt: true } } } }),
    prisma.audioRoomMember.findMany({ where: { isDeafened: true, deafenedUntil: { lte: now } }, include: { user: { select: { publicId: true } }, audioRoom: { select: { roomId: true } } } }),
  ]);
  const releasedSeats = [];
  for (const seat of seats) {
    const result = await prisma.audioRoomSeat.updateMany({ where: { id: seat.id, isForceMuted: true, forceMutedUntil: { lte: now } }, data: { isMuted: false, isForceMuted: false, forceMutedUntil: null } });
    if (result.count && seat.occupant) releasedSeats.push(seat);
  }
  const releasedMembers = [];
  for (const member of members) {
    const result = await prisma.audioRoomMember.updateMany({ where: { audioRoomId: member.audioRoomId, userId: member.userId, isDeafened: true, deafenedUntil: { lte: now } }, data: { isDeafened: false, deafenedUntil: null } });
    if (result.count) releasedMembers.push(member);
  }
  return { seats: releasedSeats, members: releasedMembers };
}
