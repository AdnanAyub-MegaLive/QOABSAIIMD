import { Prisma } from "@prisma/client";
import { activeVipWhere, userVip } from "./vip-capabilities.js";
import { perkMediaFields } from "./decoration-media.js";
import { prisma } from "./prisma.js";
import { resolveUserPerks } from "./user-perks.js";

export const roomPermissions = Object.freeze({
  OWNER: { canModerateMembers: true, canManageSeats: true, canManageChat: true, canManagePrivacy: true, canManageMusic: true, canManageMusicCatalog: true, canManageRoles: true },
  ADMIN: { canModerateMembers: true, canManageSeats: true, canManageChat: true, canManagePrivacy: true, canManageMusic: true, canManageMusicCatalog: true, canManageRoles: false },
  MEMBER: { canModerateMembers: false, canManageSeats: false, canManageChat: false, canManagePrivacy: false, canManageMusic: false, canManageMusicCatalog: false, canManageRoles: false },
});

export async function resolveRoomAccess(room, userId, client = prisma) {
  const vip = await userVip(userId, client);
  const capabilities = { canBypassSeatLock: vip.vipPrivileges.includes("ROOM_ANTI_LOCK"), canUseGifCover: vip.vipPrivileges.includes("GIF_ROOM_COVER") };
  if (room.ownerId === userId) return { role: "OWNER", permissions: { ...roomPermissions.OWNER, ...capabilities } };
  const delegated = await client.audioRoomRole.findUnique({ where: { audioRoomId_userId: { audioRoomId: room.id, userId } } });
  return delegated ? { role: delegated.role, permissions: { ...roomPermissions.ADMIN, ...capabilities } } : { role: "MEMBER", permissions: { ...roomPermissions.MEMBER, ...capabilities } };
}

export async function requireRoomPermission(room, userId, permission, client = prisma) {
  const access = await resolveRoomAccess(room, userId, client);
  if (!access.permissions[permission]) { const error = new Error("ROOM_PERMISSION_DENIED"); error.code = "ROOM_PERMISSION_DENIED"; throw error; }
  return access;
}

export async function activeRoomBan(audioRoomId, userId, client = prisma) {
  return client.audioRoomBan.findFirst({ where: { audioRoomId, userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: { createdAt: "desc" } });
}

export function permissionsForRole(role) { return roomPermissions[role] ?? roomPermissions.MEMBER; }

export async function serializeRoomMembers(room, origin, { q = null, skip = 0, take = 30, viewerId = null } = {}) {
  const canSeeInvisible = viewerId && (await resolveRoomAccess(room, viewerId)).permissions.canModerateMembers;
  const now = new Date();
  const visible = canSeeInvisible ? {} : { NOT: { vipMembership: { is: activeVipWhere("INVISIBLE_ENTRY", now) } } };
  const where = { audioRoomId: room.id, socketCount: { gt: 0 }, user: { ...visible, ...(q ? { OR: [{ publicId: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}) } };
  // Sort and filter before pagination; an invisible listener must never consume a public slot.
  const [total, ordered] = await Promise.all([prisma.audioRoomMember.count({ where }), prisma.$queryRaw(Prisma.sql`
    SELECT m."userId" FROM "AudioRoomMember" m JOIN "User" u ON u.id=m."userId"
    LEFT JOIN "VipMembership" v ON v."userId"=u.id AND v."revokedAt" IS NULL AND v."startsAt"<=${now} AND v."expiresAt">${now}
    LEFT JOIN "VipTier" t ON t.id=v."tierId" AND t.active=true
    WHERE m."audioRoomId"=${room.id} AND m."socketCount">0
      AND (${Boolean(canSeeInvisible)} OR NOT COALESCE('INVISIBLE_ENTRY'=ANY(t.privileges),false))
      AND (${q ?? ''}='' OR POSITION(LOWER(${q ?? ''}) IN LOWER(u.name))>0 OR POSITION(LOWER(${q ?? ''}) IN LOWER(u."publicId"))>0)
    ORDER BY CASE WHEN 'RANKING_PRIORITY'=ANY(t.privileges) THEN t.level ELSE 0 END DESC, m."joinedAt" ASC, u."publicId" ASC
    LIMIT ${take} OFFSET ${skip}`)]);
  const fetched = ordered.length ? await prisma.audioRoomMember.findMany({ where: { audioRoomId: room.id, userId: { in: ordered.map(r => r.userId) } }, include: { user: { select: { id: true, publicId: true, name: true, profileImage: true, gender: true, dob: true, isOfficial: true } } } }) : [];
  const byId = new Map(fetched.map(r => [r.userId, r]));
  const rows = ordered.map(r => byId.get(r.userId)).filter(Boolean);
  const userIds = rows.map((r) => r.userId);
  const [roles, seats, perks] = await Promise.all([
    prisma.audioRoomRole.findMany({ where: { audioRoomId: room.id, userId: { in: userIds } } }),
    prisma.audioRoomSeat.findMany({ where: { audioRoomId: room.id, occupantUserId: { in: userIds } } }),
    resolveUserPerks(rows.map((r) => r.user), origin, ["FRAMES", "BADGES", "BUSINESS_CARD"]),
  ]);
  return { total, members: rows.map((row) => { const seat = seats.find((s) => s.occupantUserId === row.userId); const role = room.ownerId === row.userId ? "OWNER" : roles.find((r) => r.userId === row.userId)?.role ?? (seat ? "SPEAKER" : "LISTENER"); const p = perks.get(row.user.publicId); return { ...p?.progression, ...perkMediaFields(p), publicId: row.user.publicId, displayId: row.user.publicId.replace(/^[A-Z]+-/, ""), name: row.user.name, profileImage: row.user.profileImage, frameUrl: p?.frameUrl ?? null, badgeUrl: p?.badgeUrl ?? null, businessCardUrl:p?.businessCardUrl??null,businessCardPosterUrl:p?.businessCardPosterUrl??null,businessCardMimeType:p?.businessCardMimeType??null, role, seatId: seat?.seatId ?? null, muted: seat?.isMuted ?? true, speaking: seat?.isSpeaking ?? false, deafened: Boolean(row.isDeafened), deafenedUntil: row.deafenedUntil?.toISOString() ?? null, gender: row.user.gender, dob: row.user.dob?.toISOString().slice(0,10) ?? null, isOfficial: Boolean(row.user.isOfficial), joinedAt: row.joinedAt.toISOString() }; }) };
}

export function roomManagementError(code, message) { const e = new Error(message ?? code); e.code = code; return e; }
