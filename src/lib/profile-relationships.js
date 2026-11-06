import { randomUUID } from "node:crypto";
import { relationshipChatMessage } from "./relationship-chat.js";
import { nextCpReview } from "./cp-maintenance.js";
import { syncCpLevel } from "./cp-levels.js";
const fail = (code, message, status = 422) => Object.assign(new Error(message), { code, status });
function activeCpAt(now) {
  return { type: "CP", status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

export function availableCpParticipant(now) {
  const active = activeCpAt(now);
  return {
    status: "ACTIVE", deletedAt: null,
    profileRelationshipsLeft: { none: active },
    profileRelationshipsRight: { none: active },
  };
}

async function requireAvailablePair(tx, actorId, targetId, now) {
  const participants = { in: [actorId, targetId] };
  const conflicts = await tx.profileRelationship.findMany({
    where: { ...activeCpAt(now), AND: { OR: [{ leftUserId: participants }, { rightUserId: participants }] } },
    select: { leftUserId: true, rightUserId: true },
  });
  if (!conflicts.length) return;
  const own = conflicts.some(cp => cp.leftUserId === actorId || cp.rightUserId === actorId);
  throw fail("RELATIONSHIP_LIMIT_REACHED", own ? "You already have a CP." : "This person already has a CP.", 409);
}

export async function changeProfileRelationship(db, actorId, body) {
  if (body?.type != null && body.type !== "CP") throw fail("VALIDATION_ERROR", "Only CP relationships are available.");
  return db.$transaction(async tx => {
    const action = body?.action;
    let row, targetId;
    if (action === "REQUEST") {
      if (body.type !== "CP") throw fail("VALIDATION_ERROR", "Only CP relationships are available.");
      const target = await tx.user.findUnique({ where: { publicId: String(body.userPublicId ?? "") }, select: { id: true } });
      if (!target || target.id === actorId) throw fail("RELATIONSHIP_TARGET_INVALID", "Choose another active user.");
      targetId = target.id;
    } else {
      row = await tx.profileRelationship.findUnique({ where: { publicId: String(body.relationshipId ?? "") } });
      if (!row || ![row.leftUserId, row.rightUserId].includes(actorId)) throw fail("RELATIONSHIP_NOT_FOUND", "Relationship not found.", 404);
      if (row.type !== "CP") throw fail("VALIDATION_ERROR", "Only CP relationships are available.");
      targetId = row.leftUserId === actorId ? row.rightUserId : row.leftUserId;
    }
    const [leftUserId, rightUserId] = [actorId, targetId].sort();
    await tx.$queryRaw`SELECT id FROM "User" WHERE id IN (${leftUserId}, ${rightUserId}) ORDER BY id FOR UPDATE`;
    const users = await tx.user.findMany({ where: { id: { in: [leftUserId, rightUserId] }, status: "ACTIVE", deletedAt: null } });
    if (users.length !== 2) throw fail("RELATIONSHIP_TARGET_INVALID", "Both users must be active.");
    if (["REQUEST", "ACCEPT"].includes(action) && await tx.userBlock.findFirst({ where: { OR: [{ blockerId: actorId, blockedId: targetId }, { blockerId: targetId, blockedId: actorId }] } })) throw fail("PROFILE_BLOCKED", "Relationship unavailable.", 403);
    const now = new Date();
    if (action === "REQUEST") {
      await requireAvailablePair(tx, actorId, targetId, now);
      const key = { leftUserId, rightUserId, type: body.type };
      row = await tx.profileRelationship.findUnique({ where: { leftUserId_rightUserId_type: key } });
      if (row && ["ACTIVE", "PENDING"].includes(row.status) && (!row.expiresAt || row.expiresAt > now)) throw fail("RELATIONSHIP_EXISTS", "This relationship already exists or is awaiting a response.", 409);
      const data = { ...key, status: "PENDING", leftAcceptedAt: actorId === leftUserId ? now : null, rightAcceptedAt: actorId === rightUserId ? now : null, startedAt: null, expiresAt: new Date(now.getTime() + 7 * 86400000), level: 0, exp: 0n, maintenanceDueAt: null, maintenanceCoins: 0n };
      row = await tx.profileRelationship.upsert({ where: { leftUserId_rightUserId_type: key }, create: { ...data, publicId: `REL-${randomUUID()}` }, update: data });
    } else {
      row = await tx.profileRelationship.findUnique({ where: { id: row.id } });
      if (action === "ACCEPT") {
        if (row.status !== "PENDING" || row.expiresAt <= now) throw fail("RELATIONSHIP_UNAVAILABLE", "This request is no longer available.", 409);
        if (actorId === leftUserId ? row.leftAcceptedAt : row.rightAcceptedAt) throw fail("RELATIONSHIP_RECIPIENT_REQUIRED", "Only the invited user may accept.", 403);
        await requireAvailablePair(tx, actorId, targetId, now);
        row = await tx.profileRelationship.update({ where: { id: row.id }, data: { status: "ACTIVE", leftAcceptedAt: row.leftAcceptedAt ?? now, rightAcceptedAt: row.rightAcceptedAt ?? now, startedAt: now, expiresAt: null, maintenanceDueAt: nextCpReview(now), maintenanceCoins: 0n } });
      } else if (action === "REJECT" && row.status === "PENDING" || action === "REMOVE" && row.status === "ACTIVE") {
        row = await tx.profileRelationship.update({ where: { id: row.id }, data: { status: action === "REMOVE" ? "REMOVED" : "REJECTED" } });
      } else throw fail("VALIDATION_ERROR", "Unsupported relationship action or state.");
    }
    if (action === "ACCEPT") await syncCpLevel(tx, row, await tx.cpLevel.findMany({ orderBy: { level: "asc" } }));
    await relationshipChatMessage(tx, row, users.find(user => user.id === actorId), users.find(user => user.id === targetId), action);
    await tx.auditLog.create({ data: { action: `PROFILE_RELATIONSHIP_${action}`, category: "USER_MANAGEMENT", entityType: "ProfileRelationship", entityId: row.publicId, description: `Authenticated user performed ${action} on a profile relationship.`, metadata: { actorId } } });
    return { id: row.publicId, type: row.type, status: row.status };
  }, { isolationLevel: "Serializable" });
}
