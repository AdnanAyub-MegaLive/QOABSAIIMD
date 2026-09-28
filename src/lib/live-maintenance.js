import { prisma } from "./prisma.js";
import { emitToAudioRoom, emitToVideoLive } from "./realtime.js";

export function pkWinner(leftScore, rightScore, leftId, rightId) {
  const left = BigInt(leftScore), right = BigInt(rightScore);
  return left === right ? null : left > right ? leftId : rightId;
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
