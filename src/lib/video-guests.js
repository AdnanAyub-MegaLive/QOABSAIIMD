import { randomUUID } from "node:crypto";
import { prisma } from "./prisma.js";
const fail = code => { throw new Error(code); };
export async function liveGuestAccess(tx, liveId, userId) {
  const live = await tx.videoLiveSession.findUnique({ where: { publicId: liveId }, include: { host: { select: { publicId: true, name: true, profileImage: true } } } });
  if (!live || live.status !== "LIVE") fail("LIVE_NOT_FOUND");
  const ban = await tx.videoLiveBan.findFirst({ where: { sessionId: live.id, userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
  if (ban) fail("LIVE_BANNED");
  return live;
}
export async function freeGuestSlot(tx, sessionId, now = new Date()) {
  const used = await tx.videoLiveGuestRequest.findMany({ where: { sessionId, OR: [{ status: "APPROVED" }, { status: "INVITED", expiresAt: { gt: now } }] }, select: { slot: true } });
  const slot = [1, 2, 3, 4].find(n => !used.some(r => r.slot === n));
  if (!slot) fail("GUEST_SLOTS_FULL");
  return slot;
}
export async function inviteVideoGuest(liveId, hostId, publicId, db = prisma) {
  return db.$transaction(async tx => {
    const live = await liveGuestAccess(tx, liveId, hostId);
    if (live.hostId !== hostId) fail("LIVE_HOST_REQUIRED");
    const user = await tx.user.findUnique({ where: { publicId } });
    if (!user || user.status !== "ACTIVE" || user.deletedAt || user.id === hostId) fail("GUEST_REQUEST_UNAVAILABLE");
    await liveGuestAccess(tx, liveId, user.id);
    const now = new Date();
    const existing = await tx.videoLiveGuestRequest.findFirst({ where: { sessionId: live.id, userId: user.id, OR: [{ status: "APPROVED" }, { status: "INVITED", expiresAt: { gt: now } }] } });
    if (existing) fail("GUEST_REQUEST_UNAVAILABLE");
    const slot = await freeGuestSlot(tx, live.id, now);
    await tx.videoLiveGuestRequest.updateMany({ where: { sessionId: live.id, userId: user.id, status: { in: ["PENDING", "INVITED"] } }, data: { status: "EXPIRED", respondedAt: now } });
    const invite = await tx.videoLiveGuestRequest.create({ data: { id: `LGI-${randomUUID()}`, sessionId: live.id, userId: user.id, status: "INVITED", slot, expiresAt: new Date(+now + 60000) } });
    return { publicId: user.publicId, data: { liveId, requestId: invite.id, host: live.host, slot, expiresAt: invite.expiresAt.toISOString() } };
  }, { isolationLevel: "Serializable" });
}
export async function respondVideoInvite(liveId, userId, accept, db = prisma) {
  if (typeof accept !== "boolean") throw Object.assign(new Error("accept must be a boolean."), { code: "VALIDATION_ERROR" });
  return db.$transaction(async tx => {
    const live = await liveGuestAccess(tx, liveId, userId);
    const row = await tx.videoLiveGuestRequest.findFirst({ where: { sessionId: live.id, userId, status: "INVITED", expiresAt: { gt: new Date() } }, include: { user: { select: { publicId: true, name: true, profileImage: true } } } });
    if (!row) fail("GUEST_REQUEST_UNAVAILABLE");
    await tx.videoLiveGuestRequest.update({ where: { id: row.id }, data: { status: accept ? "APPROVED" : "REJECTED", slot: accept ? row.slot : null, respondedAt: new Date() } });
    await tx.videoLiveSession.update({ where: { id: live.id }, data: { revision: { increment: 1 } } });
    return { liveId, requestId: row.id, status: accept ? "APPROVED" : "REJECTED", slot: accept ? row.slot : null, user: row.user };
  }, { isolationLevel: "Serializable" });
}
export async function reviewVideoGuest(liveId, hostId, requestId, approved, db = prisma) {
  if (typeof approved !== "boolean") throw Object.assign(new Error("approved must be a boolean."), { code: "VALIDATION_ERROR" });
  return db.$transaction(async tx => {
    const live = await liveGuestAccess(tx, liveId, hostId);
    if (live.hostId !== hostId) fail("LIVE_HOST_REQUIRED");
    const row = await tx.videoLiveGuestRequest.findFirst({ where: { id: requestId, sessionId: live.id, status: "PENDING", expiresAt: { gt: new Date() } }, include: { user: { select: { publicId: true, name: true, profileImage: true } } } });
    if (!row) fail("GUEST_REQUEST_UNAVAILABLE");
    await liveGuestAccess(tx, liveId, row.userId);
    if (await tx.videoLiveGuestRequest.findFirst({ where: { sessionId: live.id, userId: row.userId, OR: [{ status: "APPROVED" }, { status: "INVITED", expiresAt: { gt: new Date() } }] } })) fail("GUEST_REQUEST_UNAVAILABLE");
    const slot = approved ? await freeGuestSlot(tx, live.id) : null;
    await tx.videoLiveGuestRequest.update({ where: { id: row.id }, data: { status: approved ? "APPROVED" : "REJECTED", slot, respondedAt: new Date() } });
    return { liveId, requestId, status: approved ? "APPROVED" : "REJECTED", slot, user: row.user };
  }, { isolationLevel: "Serializable" });
}
