import { prisma } from "./prisma.js";
import { resolveUserPerks } from "./user-perks.js";

export const roomPermissions = Object.freeze({
  OWNER: { canModerateMembers: true, canManageSeats: true, canManageChat: true, canManagePrivacy: true, canManageMusic: true, canManageMusicCatalog: true, canManageRoles: true },
  ADMIN: { canModerateMembers: true, canManageSeats: true, canManageChat: true, canManagePrivacy: true, canManageMusic: true, canManageMusicCatalog: false, canManageRoles: false },
  MEMBER: { canModerateMembers: false, canManageSeats: false, canManageChat: false, canManagePrivacy: false, canManageMusic: false, canManageMusicCatalog: false, canManageRoles: false },
});

export async function resolveRoomAccess(room, userId, client = prisma) {
  if (room.ownerId === userId) return { role: "OWNER", permissions: roomPermissions.OWNER };
  const delegated = await client.audioRoomRole.findUnique({ where: { audioRoomId_userId: { audioRoomId: room.id, userId } } });
  return delegated ? { role: delegated.role, permissions: roomPermissions.ADMIN } : { role: "MEMBER", permissions: roomPermissions.MEMBER };
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

export async function serializeRoomMembers(room, origin, { q = null, skip = 0, take = 30 } = {}) {
  const where = { audioRoomId: room.id, socketCount: { gt: 0 }, ...(q ? { user: { OR: [{ publicId: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } } : {}) };
  const [total, rows] = await Promise.all([prisma.audioRoomMember.count({ where }), prisma.audioRoomMember.findMany({ where, include: { user: { select: { id: true, publicId: true, name: true, profileImage: true, gender: true, dob: true, isOfficial: true } } }, orderBy: [{ joinedAt: "asc" }, { userId: "asc" }], skip, take })]);
  const userIds = rows.map((r) => r.userId);
  const [roles, seats, perks] = await Promise.all([
    prisma.audioRoomRole.findMany({ where: { audioRoomId: room.id, userId: { in: userIds } } }),
    prisma.audioRoomSeat.findMany({ where: { audioRoomId: room.id, occupantUserId: { in: userIds } } }),
    resolveUserPerks(rows.map((r) => r.user), origin, ["FRAMES", "BADGES", "BUSINESS_CARD"]),
  ]);
  return { total, members: rows.map((row) => { const seat = seats.find((s) => s.occupantUserId === row.userId); const role = room.ownerId === row.userId ? "OWNER" : roles.find((r) => r.userId === row.userId)?.role ?? (seat ? "SPEAKER" : "LISTENER"); const p = perks.get(row.user.publicId); return { publicId: row.user.publicId, displayId: row.user.publicId.replace(/^[A-Z]+-/, ""), name: row.user.name, profileImage: row.user.profileImage, frameUrl: p?.frameUrl ?? null, badgeUrl: p?.badgeUrl ?? null, businessCardUrl:p?.businessCardUrl??null,businessCardPosterUrl:p?.businessCardPosterUrl??null,businessCardMimeType:p?.businessCardMimeType??null, role, seatId: seat?.seatId ?? null, muted: seat?.isMuted ?? true, speaking: seat?.isSpeaking ?? false, deafened: Boolean(row.isDeafened), deafenedUntil: row.deafenedUntil?.toISOString() ?? null, gender: row.user.gender, dob: row.user.dob?.toISOString().slice(0,10) ?? null, isOfficial: Boolean(row.user.isOfficial), joinedAt: row.joinedAt.toISOString() }; }) };
}

export function roomManagementError(code, message) { const e = new Error(message ?? code); e.code = code; return e; }
