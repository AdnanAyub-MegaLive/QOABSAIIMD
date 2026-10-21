import { createHash, randomUUID } from "node:crypto";
import { prisma } from "./prisma.js";
import { ledgerData } from "./wallet.js";
import { bannerError, bannerObject } from "./room-banner-media.js";
import { notifyAction } from "./action-notifications.js";
import { normalizeBannerText, validateBannerText } from "./room-banner-text.js";

export function validateBannerSettings(input) {
  if (typeof input.enabled !== "boolean" || !Array.isArray(input.packages) || input.packages.length > 20) throw bannerError("VALIDATION_ERROR", "Provide enabled and up to 20 duration packages.");
  const ids = new Set();
  const packages = input.packages.map(p => {
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(p.id ?? "") || ids.has(p.id) || typeof p.name !== "string" || !p.name.trim() || p.name.length > 60 || !Number.isInteger(p.durationDays) || p.durationDays < 1 || p.durationDays > 365 || !/^[1-9]\d{0,14}$/.test(String(p.coins))) throw bannerError("VALIDATION_ERROR", "Each package needs a unique ID, name, 1–365 days and a positive Coin price.");
    ids.add(p.id); return { id: p.id, name: p.name.trim(), durationDays: p.durationDays, coins: String(p.coins) };
  });
  if (input.enabled && !packages.length) throw bannerError("VALIDATION_ERROR", "Add a package before enabling banners.");
  return { enabled: input.enabled, packages };
}
export async function bannerSettings(db = prisma) {
  return { enabled: false, packages: [], revision: 0, ...(await db.roomBannerSettings.findUnique({ where: { id: "default" } })), maxBanners: 2, maxBytes: 5 * 1024 * 1024, moderationRequired: true,
    textLimits: { nameRequired: true, nameMaxCharacters: 60, descriptionMaxWords: 200, descriptionMaxCharacters: 2000, descriptionMaxLineBreaks: 10, linksAllowed: false } };
}
export function publicBanner(b) { return { id: b.id, name: b.name ?? "", description: b.description ?? "", imageUrl: b.imageUrl, mimeType: b.mimeType, mediaVersion: b.mediaVersion, position: b.position, expiresAt: b.expiresAt }; }
export function ownerBanner(b) { return { ...publicBanner(b), status: b.status, createdAt: b.createdAt, reason: b.reason, coins: b.coins.toString(), durationDays: b.durationDays, refundedAt: b.refundedAt, previewUrl: `/api/room-banners/${b.id}/preview` }; }
export async function roomBannerSnapshot(roomId, db = prisma) {
  const room = await db.audioRoom.findUnique({ where: { roomId }, select: { bannerRevision: true, banners: { where: { status: "ACTIVE", expiresAt: { gt: new Date() } }, orderBy: [{ position: "asc" }, { id: "asc" }], take: 2 } } });
  if (!room) throw bannerError("ROOM_UNAVAILABLE", "Room not found.", 404);
  return { roomId, revision: room.bannerRevision, banners: room.banners.map(publicBanner) };
}
async function transaction(fn, db = prisma) {
  for (let n = 0; ; n++) { try { return await db.$transaction(fn, { isolationLevel: "Serializable", timeout: 30000 }); } catch (e) { if (!["P2034", "P2002"].includes(e.code) || n >= 3) throw e; } }
}
async function lockRoom(tx, roomId, ownerId) {
  const room = await tx.audioRoom.findUnique({ where: { roomId } });
  if (!room) throw bannerError("ROOM_UNAVAILABLE", "Room not found.", 404);
  if (ownerId && room.ownerId !== ownerId) throw bannerError("ROOM_OWNER_ONLY", "Only the room owner can manage banners.", 403);
  await tx.$queryRaw`SELECT id FROM "AudioRoom" WHERE id = ${room.id} FOR UPDATE`;
  return room;
}
async function bump(tx, room) { await tx.audioRoom.update({ where: { id: room.id }, data: { bannerRevision: { increment: 1 } } }); }
export async function submitBanner({ roomId, userId, requestId, packageId, settingsRevision, media, name, description }, db = prisma) {
  if (typeof requestId !== "string" || !/^[\w-]{1,128}$/.test(requestId)) throw bannerError("VALIDATION_ERROR", "Provide a unique requestId (1–128 letters, numbers, underscores or hyphens).");
  const normalizedText = normalizeBannerText({ name, description });
  const fingerprint = createHash("sha256").update(JSON.stringify([roomId, packageId, settingsRevision, media.mimeType, normalizedText.name, normalizedText.description])).update(media.bytes).digest("hex");
  // A private staging object is never publicly accessible; failed transactions cannot charge the user.
  const key = `private-room-banners/${randomUUID()}.webp`;
  return transaction(async tx => {
    const room = await lockRoom(tx, roomId, userId);
    const old = await tx.roomBanner.findUnique({ where: { ownerId_requestId: { ownerId: userId, requestId } } });
    if (old) { if (old.fingerprint !== fingerprint) throw bannerError("IDEMPOTENCY_CONFLICT", "This request ID was used with different content.", 409); return ownerBanner(old); }
    const text = await validateBannerText(tx, { name, description });
    const settings = await bannerSettings(tx), pack = settings.packages.find(p => p.id === packageId);
    if (!settings.enabled) throw bannerError("BANNERS_DISABLED", "Room banners are currently disabled.", 403);
    if (!pack || settings.revision !== settingsRevision) throw bannerError("BANNER_PRICE_CHANGED", "Banner prices changed. Refresh and confirm the price again.", 409);
    const occupied = await tx.roomBanner.findMany({ where: { audioRoomId: room.id, OR: [{ status: "PENDING" }, { status: "ACTIVE", expiresAt: { gt: new Date() } }] } });
    if (occupied.length >= 2) throw bannerError("BANNER_LIMIT_REACHED", "This room already has 2 banners. Remove one to add a new one.", 409);
    const paid = await tx.user.updateMany({ where: { id: userId, status: "ACTIVE", deletedAt: null, coinBalance: { gte: BigInt(pack.coins) } }, data: { coinBalance: { decrement: BigInt(pack.coins) } } });
    if (!paid.count) throw bannerError("INSUFFICIENT_COINS", "Your account is unavailable or has insufficient Coins.", 409);
    await bannerObject("put", key, media.bytes, media.mimeType);
    const banner = await tx.roomBanner.create({ data: { ...text, audioRoomId: room.id, ownerId: userId, requestId, fingerprint, position: occupied.some(b => b.position === 1) ? 2 : 1, coins: BigInt(pack.coins), durationDays: pack.durationDays, packageName: pack.name, storageKey: key, mimeType: media.mimeType, mediaVersion: media.mediaVersion } });
    await tx.walletTransaction.create({ data: ledgerData({ userId, type: "ROOM_BANNER_PURCHASE", direction: "DEBIT", title: "Room banner submitted for review", coins: banner.coins, referenceId: banner.id }) });
    await bump(tx, room); return ownerBanner(banner);
  }, db);
}
export async function editBannerText({ roomId, id, userId, adminId, name, description }, db = prisma) {
  return transaction(async tx => {
    const room = await lockRoom(tx, roomId, adminId ? null : userId);
    const banner = await tx.roomBanner.findFirst({ where: { id, audioRoomId: room.id } });
    if (!banner) throw bannerError("BANNER_NOT_FOUND", "Banner not found.", 404);
    if (banner.status !== "PENDING") throw bannerError("BANNER_TEXT_LOCKED", "Only banners in review can have their text changed.", 409);
    const text = await validateBannerText(tx, { name, description }, { allowBlankName: Boolean(adminId) });
    const updated = await tx.roomBanner.update({ where: { id }, data: text });
    await tx.auditLog.create({ data: { ...(adminId ? { adminId } : {}), action: "ROOM_BANNER_TEXT_UPDATED", category: "CONTENT_MANAGEMENT", entityType: "RoomBanner", entityId: id, description: "Updated pending banner text", metadata: { roomId, actorUserId: userId ?? null, before: { name: banner.name ?? "", description: banner.description ?? "" }, after: text } } });
    await bump(tx, room);
    return ownerBanner(updated);
  }, db);
}
export async function changeBanner({ roomId, id, action, userId, adminId, reason }, db = prisma) {
  return transaction(async tx => {
    const room = await lockRoom(tx, roomId, adminId ? null : userId);
    const b = await tx.roomBanner.findFirst({ where: { id, audioRoomId: room.id } });
    if (!b) throw bannerError("BANNER_NOT_FOUND", "Banner not found.", 404);
    if (!adminId && action !== "DELETE") throw bannerError("FORBIDDEN", "Review requires an administrator.", 403);
    if (!["APPROVE", "REJECT", "DELETE"].includes(action)) throw bannerError("VALIDATION_ERROR", "Unknown banner action.");
    if (["REJECTED", "DELETED", "EXPIRED"].includes(b.status) || (action === "APPROVE" && b.status === "ACTIVE")) return ownerBanner(b);
    const now = new Date(); let data;
    if (action === "APPROVE") {
      const object = await bannerObject("get", b.storageKey);
      const bytes = Buffer.from(await object.Body.transformToByteArray());
      const publicKey = `room-banners/${b.id}-${b.mediaVersion}.webp`;
      const url = await bannerObject("put", publicKey, bytes, b.mimeType);
      data = { status: "ACTIVE", publicKey, imageUrl: `${url}?v=${b.mediaVersion}`, reviewedAt: now, expiresAt: new Date(now.getTime() + b.durationDays * 86400000) };
    } else {
      if (action === "REJECT" && b.status !== "PENDING") throw bannerError("BANNER_ALREADY_ACTIVE", "Use removal for an active banner. Active banners are not refundable.", 409);
      if (adminId && (typeof reason !== "string" || !reason.trim() || reason.length > 500)) throw bannerError("VALIDATION_ERROR", "Provide a review/removal reason (up to 500 characters).");
      data = { status: action === "REJECT" ? "REJECTED" : "DELETED", reason: adminId ? reason.trim() : "Removed by owner", reviewedAt: now };
      if (b.status === "PENDING" && !b.refundedAt) {
        await tx.user.update({ where: { id: b.ownerId }, data: { coinBalance: { increment: b.coins } } });
        await tx.walletTransaction.create({ data: ledgerData({ userId: b.ownerId, type: "REFUND", direction: "CREDIT", title: "Room banner refund", coins: b.coins, referenceId: b.id }) });
        data.refundedAt = now;
      }
    }
    const result = await tx.roomBanner.update({ where: { id }, data });
    await notifyAction(tx, { userId: b.ownerId, key: `banner:${id}:${data.status}`, type: "ROOM_BANNER", title: `Room banner ${data.status.toLowerCase()}`, body: data.reason ?? "Your paid banner is now active.", action: { screen: "ROOM_BANNERS", roomId, bannerId: id } });
    await tx.auditLog.create({ data: { ...(adminId ? { adminId } : {}), action: `ROOM_BANNER_${action}`, category: "CONTENT_MANAGEMENT", entityType: "RoomBanner", entityId: id, description: data.reason ?? "Banner approved", metadata: { roomId, ownerId: b.ownerId } } });
    await bump(tx, room); return ownerBanner(result);
  }, db);
}
export async function reorderBanners(roomId, userId, ids, db = prisma) {
  if (!Array.isArray(ids) || ids.length > 2 || new Set(ids).size !== ids.length) throw bannerError("VALIDATION_ERROR", "Provide each current banner ID once.");
  await transaction(async tx => {
    const room = await lockRoom(tx, roomId, userId);
    const rows = await tx.roomBanner.findMany({ where: { audioRoomId: room.id, OR: [{ status: "PENDING" }, { status: "ACTIVE", expiresAt: { gt: new Date() } }] } });
    if (rows.length !== ids.length || rows.some(b => !ids.includes(b.id))) throw bannerError("BANNER_LIST_CHANGED", "Refresh the banner list and try again.", 409);
    for (let i = 0; i < ids.length; i++) await tx.roomBanner.update({ where: { id: ids[i] }, data: { position: i + 1 } });
    await bump(tx, room);
  }, db);
}
export async function maintainRoomBanners(db = prisma) {
  const cleanup = await db.roomBannerObject.findMany({ where: { checkAt: { lte: new Date() } }, take: 20 });
  for (const object of cleanup) {
    try {
    const linked = await db.roomBanner.findFirst({ where: { OR: [{ storageKey: object.key }, { publicKey: object.key }], status: { in: ["PENDING", "ACTIVE"] } }, select: { id: true } });
    if (linked) await db.roomBannerObject.update({ where: { key: object.key }, data: { checkAt: new Date(Date.now() + 86400000) } });
    else { await bannerObject("delete", object.key); await db.roomBannerObject.delete({ where: { key: object.key } }); }
    } catch (error) { console.error("Banner object cleanup will retry", error.code ?? error.name); }
  }
  const reminders = await db.roomBanner.findMany({ where: { status: "ACTIVE", remindedAt: null, expiresAt: { gt: new Date(), lte: new Date(Date.now() + 86400000) } }, include: { room: { select: { roomId: true } } }, take: 100 });
  for (const row of reminders) await transaction(async tx => {
    const result = await tx.roomBanner.updateMany({ where: { id: row.id, status: "ACTIVE", remindedAt: null }, data: { remindedAt: new Date() } });
    if (result.count) await notifyAction(tx, { userId: row.ownerId, key: `banner:${row.id}:expiry-reminder`, type: "ROOM_BANNER", title: "Room banner expires soon", body: "Your room banner will expire within 24 hours.", action: { screen: "ROOM_BANNERS", roomId: row.room.roomId, bannerId: row.id } });
  }, db);
  const expired = await db.roomBanner.findMany({ where: { status: "ACTIVE", expiresAt: { lte: new Date() } }, include: { room: { select: { roomId: true } } }, take: 100 });
  for (const row of expired) await transaction(async tx => {
    const room = await lockRoom(tx, row.room.roomId);
    const result = await tx.roomBanner.updateMany({ where: { id: row.id, status: "ACTIVE", expiresAt: { lte: new Date() } }, data: { status: "EXPIRED" } });
    if (result.count) { await bump(tx, room); await notifyAction(tx, { userId: row.ownerId, key: `banner:${row.id}:expired`, type: "ROOM_BANNER", title: "Room banner expired", body: "Your banner has expired and its slot is available again.", action: { screen: "ROOM_BANNERS", roomId: row.room.roomId } }); }
  }, db);
  if (!globalThis.portalIo) return;
  const rooms = await db.$queryRaw`SELECT "roomId" FROM "AudioRoom" WHERE "bannerRevision" > "bannerBroadcastRevision" LIMIT 100`;
  for (const room of rooms) {
    const snapshot = await roomBannerSnapshot(room.roomId, db);
    globalThis.portalIo.to(`audio-room:${room.roomId}`).emit("audio-room:banners-changed", { success: true, data: snapshot });
    await db.audioRoom.updateMany({ where: { roomId: room.roomId, bannerRevision: snapshot.revision }, data: { bannerBroadcastRevision: snapshot.revision } });
  }
}
