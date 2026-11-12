import { prisma } from "./prisma.js";
import { dismissRtcRoom, removeRtcParticipant } from "./rtc-moderation.js";
import { requireVideoAccess } from "./video-access.js";
import { emitToVideoLive } from "./realtime.js";
export async function closeVideoRtc(live, db = prisma) {
  if (live.rtcClosedAt) return;
  await dismissRtcRoom(`video-${live.publicId}`);
  globalThis.portalIo?.in(`live-video:${live.publicId}`).socketsLeave(`live-video:${live.publicId}`);
  await db.videoLiveSession.update({ where: { id: live.id }, data: { rtcClosedAt: new Date() } });
}
export async function endVideoLive(live, admin = null, db = prisma) {
  const row = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('video-pk-matching'))`;
    await tx.$queryRaw`SELECT id FROM "VideoLiveSession" WHERE id = ${live.id} FOR UPDATE`;
    await tx.videoLiveSession.updateMany({ where: { id: live.id, status: "LIVE" }, data: { status: "ENDED", endedAt: new Date(), viewerCount: 0, revision: { increment: 1 } } });
    await tx.videoLiveViewer.updateMany({ where: { sessionId: live.id }, data: { active: false, socketCount: 0 } });
    await tx.videoLiveGuestRequest.updateMany({ where: { sessionId: live.id, status: { in: ["PENDING", "INVITED", "APPROVED"] } }, data: { status: "EXPIRED", respondedAt: new Date() } });
    await tx.videoLivePkQueue.deleteMany({ where: { sessionId: live.id } });
    await tx.videoLivePkSession.updateMany({ where: { status: { in: ["PENDING", "LIVE"] }, OR: [{ leftSessionId: live.id }, { rightSessionId: live.id }] }, data: { status: "ENDED", endedAt: new Date(), revision: { increment: 1 } } });
    if (admin) await tx.auditLog.create({ data: { adminId: admin.id, action: "VIDEO_LIVE_ENDED", category: "CONTENT_MANAGEMENT", entityType: "VideoLiveSession", entityId: live.publicId, description: "Administrator ended video live." } });
    return tx.videoLiveSession.findUnique({ where: { id: live.id }, include: { host: true } });
  });
  await emitToVideoLive(row.publicId, "live-video:ended", { success: true, data: { liveId: row.publicId, status: "ENDED", endedAt: row.endedAt.toISOString(), revision: row.revision } });
  // Keep rtcClosedAt null on failure so maintenance retries provider cleanup.
  await closeVideoRtc(row, db);
  return row;
}
export async function retryVideoRtcCleanup(db = prisma) {
  const rows = await db.videoLiveSession.findMany({ where: { status: "ENDED", rtcClosedAt: null }, orderBy: { endedAt: "desc" }, take: 25 });
  for (const row of rows) try { await closeVideoRtc(row, db); } catch { console.error("Video RTC cleanup will retry", { liveId: row.publicId }); }
}
export async function enforceVideoPrivacy(live, db = prisma) {
  const viewers = await db.videoLiveViewer.findMany({ where: { sessionId: live.id, active: true }, include: { user: { select: { publicId: true } } } });
  for (const viewer of viewers) {
    try { await requireVideoAccess(db, live, viewer.userId); }
    catch (e) {
      if (e.status !== 403) throw e;
      globalThis.portalIo?.in(`user:${viewer.user.publicId}`).socketsLeave(`live-video:${live.publicId}`);
      await removeRtcParticipant(`video-${live.publicId}`, viewer.user.publicId);
      await db.videoLiveViewer.update({ where: { sessionId_userId: { sessionId: live.id, userId: viewer.userId } }, data: { active: false, socketCount: 0 } });
    }
  }
}
