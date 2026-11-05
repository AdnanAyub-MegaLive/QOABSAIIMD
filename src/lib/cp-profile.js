import { activeCpWhere, cpProgress } from './cp-levels.js';
import { equippedProfileAssets } from './profile-display-assets.js';
import { avatarDisplayUrl } from './avatar-history.js';

const publicPerson = { id: true, publicId: true, name: true, profileImage: true };
export async function userCp(db, target, viewer, origin) {
  const relationship = await db.profileRelationship.findFirst({
    where: { ...activeCpWhere(), AND: [{ OR: [{ leftUserId: target.id }, { rightUserId: target.id }] }],
      left: { status: 'ACTIVE', deletedAt: null }, right: { status: 'ACTIVE', deletedAt: null } },
    include: { left: { select: publicPerson }, right: { select: publicPerson } },
  });
  if (!relationship) return null;
  const partner = relationship.leftUserId === target.id ? relationship.right : relationship.left;
  const blocked = await db.userBlock.findFirst({ where: { OR: [
    { blockerId: viewer.id, blockedId: { in: [target.id, partner.id] } },
    { blockedId: viewer.id, blockerId: { in: [target.id, partner.id] } },
  ] } });
  if (blocked) return null;
  const [levels, claims, equipment] = await Promise.all([
    db.cpLevel.findMany({ orderBy: { level: 'asc' } }),
    db.cpLevelClaim.findMany({ where: { relationshipId: relationship.id }, orderBy: { level: 'asc' }, select: { level: true } }),
    equippedProfileAssets([target, partner], origin, db),
  ]);
  const identity = person => ({ publicId: person.publicId, name: person.name,
    profileImage: avatarDisplayUrl(person.profileImage, origin), frameUrl: equipment.get(person.id)?.avatarFrame?.url ?? null });
  return { id: relationship.publicId, self: identity(target), partner: identity(partner),
    ...cpProgress(relationship.exp, levels), startedAt: relationship.startedAt?.toISOString() ?? null,
    daysTogether: relationship.startedAt ? Math.max(0, Math.floor((Date.now() - relationship.startedAt.getTime()) / 86400000)) : 0,
    claimedRewards: claims.map(row => row.level) };
}
export async function cpSeatPresence(db, users) {
  if (!users.length) return new Map();
  const ids = users.map(user => user.id);
  const [levels, relationships] = await Promise.all([
    db.cpLevel.findMany({ orderBy: { level: 'asc' } }),
    db.profileRelationship.findMany({ where: { ...activeCpWhere(),
      AND: [{ OR: [{ leftUserId: { in: ids } }, { rightUserId: { in: ids } }] }],
      left: { status: 'ACTIVE', deletedAt: null }, right: { status: 'ACTIVE', deletedAt: null } },
      include: { left: { select: { publicId: true } }, right: { select: { publicId: true } } } }),
  ]);
  const result = new Map();
  for (const row of relationships) {
    const { level, seatEffect, seatColor } = cpProgress(row.exp, levels);
    result.set(row.leftUserId, { partnerId: row.right.publicId, level, seatEffect, seatColor });
    result.set(row.rightUserId, { partnerId: row.left.publicId, level, seatEffect, seatColor });
  }
  return result;
}
