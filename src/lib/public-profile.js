import { prisma } from "./prisma.js";
import { avatarDisplayUrl } from "./avatar-history.js";
import { createPublicDisplayAssetUrl } from "./upload-assets.js";
import { publicProgression } from "./progression.js";
import { displayApplicationRole, APPLICATION_ROLES } from "./user-roles.js";

export const publicPerson = { id: true, publicId: true, name: true, profileImage: true, isOfficial: true };
export const activePerson = { status: "ACTIVE", deletedAt: null };
const failure = code => Object.assign(new Error(code), { code });
export function publicAge(dob, visible, now = new Date()) {
  if (!visible || !dob || dob > now) return null;
  return now.getUTCFullYear() - dob.getUTCFullYear() - (now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate()) ? 1 : 0);
}
export async function profileAccess(viewer, publicId, db = prisma) {
  const target = await db.user.findUnique({ where: { publicId }, include: { agency: true, audioRooms: { where: { status: { in: ["LIVE", "IDLE"] }, isBlocked: false, privacyMode: "PUBLIC" }, select: { roomId: true, status: true, title: true }, take: 1 } } });
  if (!target || target.deletedAt || target.status !== "ACTIVE") throw failure("USER_NOT_FOUND");
  const [blocked, friendRequest] = await Promise.all([
    db.userBlock.findFirst({ where: { OR: [{ blockerId: viewer.id, blockedId: target.id }, { blockerId: target.id, blockedId: viewer.id }] } }),
    db.friendRequest.findFirst({ where: { status: { in: ["PENDING", "ACCEPTED"] }, OR: [{ requesterId: viewer.id, addresseeId: target.id }, { requesterId: target.id, addresseeId: viewer.id }] } }),
  ]);
  if (blocked) throw failure("PROFILE_BLOCKED");
  const isSelf = target.id === viewer.id, isFriend = !isSelf && friendRequest?.status === "ACCEPTED";
  if (target.profilePrivate && !isSelf && !isFriend) throw failure("PROFILE_PRIVATE");
  return { target, isSelf, isFriend, friendRequest: { status: isFriend ? "FRIENDS" : !friendRequest || isSelf ? "NONE" : friendRequest.requesterId === viewer.id ? "PENDING_SENT" : "PENDING_RECEIVED", requestId: isSelf ? null : friendRequest?.publicId ?? null } };
}
export async function recordProfileVisit(targetId, viewerId, db = prisma) {
  if (targetId === viewerId) return;
  await db.$executeRaw`
    INSERT INTO "UserProfileVisit" ("targetId", "visitorId", "visitCount", "firstVisitedAt", "lastVisitedAt")
    VALUES (${targetId}, ${viewerId}, 1, NOW(), NOW())
    ON CONFLICT ("targetId", "visitorId") DO UPDATE SET "visitCount" = "UserProfileVisit"."visitCount" + 1, "lastVisitedAt" = NOW()
    WHERE "UserProfileVisit"."lastVisitedAt" < NOW() - INTERVAL '24 hours'
  `;
}
export async function displayAssets(ids, origin, db = prisma) {
  const rows = ids.length ? await db.uploadAsset.findMany({ where: { publicId: { in: [...new Set(ids.filter(Boolean))] }, active: true }, select: { publicId: true, name: true, category: true, mimeType: true, posterMimeType: true } }) : [];
  return new Map(rows.map(asset => [asset.publicId, { assetId: asset.publicId, url: createPublicDisplayAssetUrl(origin, asset.publicId), posterUrl: asset.posterMimeType ? `${createPublicDisplayAssetUrl(origin, asset.publicId)}&poster=1` : null, mimeType: asset.mimeType, category: asset.category, name: asset.name }]));
}
export async function equippedProfileAssets(users, origin, db = prisma) {
  const now = new Date();
  const rows = await db.userEquippedProp.findMany({ where: { userId: { in: users.map(u => u.id) }, category: { in: ["FRAMES", "BADGES", "PROFILE_DRESS"] }, asset: { active: true } }, include: { asset: { select: { publicId: true, isGlobal: true, mimeType: true, category: true, assignments: { where: { userId: { in: users.map(u => u.id) }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { userId: true } } } } } });
  const assets = await displayAssets(rows.map(r => r.asset.publicId), origin, db);
  const results = new Map(users.map(u => [u.id, { avatarFrame: null, profileBadge: null, profileDress: null }]));
  const keys = { FRAMES: "avatarFrame", BADGES: "profileBadge", PROFILE_DRESS: "profileDress" };
  for (const row of rows) {
    if (row.asset.category !== row.category || (!row.asset.isGlobal && !row.asset.assignments.some(a => a.userId === row.userId))) continue;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4"].includes(row.asset.mimeType)) continue;
    const asset = assets.get(row.asset.publicId);
    if (asset) { const { assetId, url, posterUrl, mimeType } = asset; results.get(row.userId)[keys[row.category]] = { assetId, url, posterUrl, mimeType }; }
  }
  return results;
}
export function wallCursor(offset) { return Buffer.from(JSON.stringify({ offset })).toString("base64url"); }
export function wallOffset(cursor) {
  if (!cursor) return 0;
  try { const { offset } = JSON.parse(Buffer.from(cursor, "base64url").toString()); if (Number.isSafeInteger(offset) && offset >= 0 && offset <= 100000) return offset; } catch {}
  throw failure("INVALID_CURSOR");
}
export async function medalWall(userId, origin, { limit = 4, cursor } = {}, db = prisma) {
  const offset = wallOffset(cursor);
  const rows = await db.userMedal.findMany({ where: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], assetPublicId: { in: (await db.uploadAsset.findMany({ where: { active: true, category: "MEDALS" }, select: { publicId: true } })).map(a => a.publicId) } }, orderBy: [{ pinned: "desc" }, { earnedAt: "desc" }, { id: "desc" }], skip: offset, take: limit + 1 });
  const assets = await displayAssets(rows.map(r => r.assetPublicId), origin, db);
  return { items: rows.slice(0, limit).map(row => ({ id: row.publicId, name: row.name, imageUrl: assets.get(row.assetPublicId)?.url ?? null, earnedAt: row.earnedAt.toISOString(), expiresAt: row.expiresAt?.toISOString() ?? null })), nextCursor: rows.length > limit ? wallCursor(offset + limit) : null };
}
export async function receivedGiftWall(userId, origin, { limit = 20, cursor } = {}, db = prisma) {
  const offset = wallOffset(cursor);
  const rows = await db.giftTransaction.groupBy({ by: ["giftAssetId"], where: { recipientUserId: userId, reversedAt: null, giftAssetId: { not: null } }, _sum: { quantity: true, coinValue: true }, orderBy: [{ _sum: { coinValue: "desc" } }, { _sum: { quantity: "desc" } }, { giftAssetId: "asc" }], skip: offset, take: limit + 1 });
  const assets = await db.uploadAsset.findMany({ where: { id: { in: rows.map(r => r.giftAssetId) } }, select: { id: true, publicId: true, name: true, mimeType: true, active: true } });
  const map = new Map(assets.map(a => [a.id, a]));
  return { items: rows.slice(0, limit).flatMap(row => { const asset = map.get(row.giftAssetId); return asset ? [{ giftId: asset.publicId, name: asset.name, quantity: row._sum.quantity ?? 0, totalCoins: (row._sum.coinValue ?? 0n).toString(), mediaUrl: asset.active ? createPublicDisplayAssetUrl(origin, asset.publicId) : null, mimeType: asset.mimeType }] : []; }), nextCursor: rows.length > limit ? wallCursor(offset + limit) : null };
}
export async function profileExtras(target, viewer, origin, db = prisma) {
  const roles = [...new Set(target.appRoles)].filter(r => APPLICATION_ROLES.includes(r));
  const [equipment, progress, roleRows, medals, gifts, supporters, relationships] = await Promise.all([
    equippedProfileAssets([target], origin, db), publicProgression([target], origin, db, true),
    db.roleBadge.findMany({ where: { code: { in: roles } } }), medalWall(target.id, origin, {}, db), receivedGiftWall(target.id, origin, {}, db),
    db.giftTransaction.groupBy({ by: ["senderId"], where: { recipientUserId: target.id, reversedAt: null, sender: activePerson }, _sum: { coinValue: true }, orderBy: [{ _sum: { coinValue: "desc" } }, { senderId: "asc" }], take: 3 }),
    db.profileRelationship.findMany({ where: { status: "ACTIVE", leftAcceptedAt: { not: null }, rightAcceptedAt: { not: null }, left: activePerson, right: activePerson, AND: [{ OR: [{ leftUserId: target.id }, { rightUserId: target.id }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }] }, include: { left: { select: publicPerson }, right: { select: publicPerson } }, orderBy: { publicId: "asc" } }),
  ]);
  const people = await db.user.findMany({ where: { id: { in: supporters.map(s => s.senderId) }, ...activePerson }, select: publicPerson });
  const related = relationships.map(r => r.leftUserId === target.id ? r.right : r.left);
  const blocked = await db.userBlock.findMany({ where: { OR: [{ blockerId: viewer.id }, { blockedId: viewer.id }] }, select: { blockerId: true, blockedId: true } });
  const hidden = new Set(blocked.map(b => b.blockerId === viewer.id ? b.blockedId : b.blockerId));
  const decorations = await equippedProfileAssets([...people, ...related], origin, db);
  const identity = p => ({ publicId: p.publicId, name: p.name, profileImage: avatarDisplayUrl(p.profileImage, origin), frameUrl: decorations.get(p.id)?.avatarFrame?.url ?? null, badgeUrl: decorations.get(p.id)?.profileBadge?.url ?? null });
  const agency = target.agency?.status === "ACTIVE" ? target.agency : null;
  const assets = await displayAssets([...roleRows.map(r => r.assetPublicId), agency?.logoAssetPublicId, agency?.badgeAssetPublicId], origin, db);
  const equippedAssets = equipment.get(target.id);
  const levels = progress.get(target.publicId);
  return { roles, roleBadges: roles.map(code => { const configured = roleRows.find(r => r.code === code); return { code, label: configured?.label ?? displayApplicationRole(code), imageUrl: assets.get(configured?.assetPublicId)?.url ?? null }; }),
    equippedAssets, frameUrl: equippedAssets.avatarFrame?.url ?? null, badgeUrl: equippedAssets.profileBadge?.url ?? null,
    homeDressUrl: equippedAssets.profileDress?.url ?? null, homeDressPosterUrl: equippedAssets.profileDress?.posterUrl ?? null, homeDressMimeType: equippedAssets.profileDress?.mimeType ?? null,
    ...levels, medalWall: medals, giftWall: gifts,
    agency: agency ? { publicId: agency.publicId, name: agency.name, status: agency.status, level: agency.level, logoUrl: assets.get(agency.logoAssetPublicId)?.url ?? null, badgeUrl: assets.get(agency.badgeAssetPublicId)?.url ?? null } : null,
    topSupporters: supporters.flatMap(s => { const person = people.find(p => p.id === s.senderId); return person && !hidden.has(person.id) ? [{ ...identity(person), totalCoins: (s._sum.coinValue ?? 0n).toString() }] : []; }).map((s, i) => ({ rank: i + 1, ...s })),
    relationships: relationships.flatMap(r => { const partner = r.leftUserId === target.id ? r.right : r.left; return !hidden.has(partner.id) ? [{ id: r.publicId, type: r.type, status: r.status, level: r.level, days: Math.max(0, Math.floor((Date.now() - r.startedAt.getTime()) / 86400000)), partner: identity(partner) }] : []; }),
  };
}
