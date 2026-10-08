import { randomUUID } from "node:crypto";
const fail = (code, message, status = 422) => Object.assign(new Error(message), { code, status });
export async function changeProfileRelationship(db, actorId, body) {
  return db.$transaction(async tx => {
    const action = body?.action;
    let row, targetId;
    if (action === "REQUEST") {
      if (!["CP", "BFF", "BRO", "SIS"].includes(body.type)) throw fail("VALIDATION_ERROR", "Choose CP, BFF, BRO or SIS.");
      const target = await tx.user.findUnique({ where: { publicId: String(body.userPublicId ?? "") }, select: { id: true } });
      if (!target || target.id === actorId) throw fail("RELATIONSHIP_TARGET_INVALID", "Choose another active user.");
      targetId = target.id;
    } else {
      row = await tx.profileRelationship.findUnique({ where: { publicId: String(body.relationshipId ?? "") } });
      if (!row || ![row.leftUserId, row.rightUserId].includes(actorId)) throw fail("RELATIONSHIP_NOT_FOUND", "Relationship not found.", 404);
      targetId = row.leftUserId === actorId ? row.rightUserId : row.leftUserId;
    }
    const [leftUserId, rightUserId] = [actorId, targetId].sort();
    await tx.$queryRaw`SELECT id FROM "User" WHERE id IN (${leftUserId}, ${rightUserId}) ORDER BY id FOR UPDATE`;
    const users = await tx.user.findMany({ where: { id: { in: [leftUserId, rightUserId] }, status: "ACTIVE", deletedAt: null } });
    if (users.length !== 2) throw fail("RELATIONSHIP_TARGET_INVALID", "Both users must be active.");
    if (["REQUEST", "ACCEPT"].includes(action) && await tx.userBlock.findFirst({ where: { OR: [{ blockerId: actorId, blockedId: targetId }, { blockerId: targetId, blockedId: actorId }] } })) throw fail("PROFILE_BLOCKED", "Relationship unavailable.", 403);
    const now = new Date();
    if (action === "REQUEST") {
      const key = { leftUserId, rightUserId, type: body.type };
      row = await tx.profileRelationship.findUnique({ where: { leftUserId_rightUserId_type: key } });
      if (row && ["ACTIVE", "PENDING"].includes(row.status) && (!row.expiresAt || row.expiresAt > now)) throw fail("RELATIONSHIP_EXISTS", "This relationship already exists or is awaiting a response.", 409);
      const data = { ...key, status: "PENDING", leftAcceptedAt: actorId === leftUserId ? now : null, rightAcceptedAt: actorId === rightUserId ? now : null, startedAt: null, expiresAt: new Date(now.getTime() + 7 * 86400000), level: 0 };
      row = await tx.profileRelationship.upsert({ where: { leftUserId_rightUserId_type: key }, create: { ...data, publicId: `REL-${randomUUID()}` }, update: data });
    } else {
      row = await tx.profileRelationship.findUnique({ where: { id: row.id } });
      if (action === "ACCEPT") {
        if (row.status !== "PENDING" || row.expiresAt <= now) throw fail("RELATIONSHIP_UNAVAILABLE", "This request is no longer available.", 409);
        if (actorId === leftUserId ? row.leftAcceptedAt : row.rightAcceptedAt) throw fail("RELATIONSHIP_RECIPIENT_REQUIRED", "Only the invited user may accept.", 403);
        const conflict = await tx.profileRelationship.findFirst({ where: { type: row.type, status: "ACTIVE", AND: [{ OR: [{ leftUserId: { in: [leftUserId, rightUserId] } }, { rightUserId: { in: [leftUserId, rightUserId] } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] } });
        if (conflict) throw fail("RELATIONSHIP_LIMIT_REACHED", "A user already has an active partner of this type.", 409);
        row = await tx.profileRelationship.update({ where: { id: row.id }, data: { status: "ACTIVE", leftAcceptedAt: row.leftAcceptedAt ?? now, rightAcceptedAt: row.rightAcceptedAt ?? now, startedAt: now, expiresAt: null } });
      } else if (action === "REJECT" && row.status === "PENDING" || action === "REMOVE" && row.status === "ACTIVE") {
        row = await tx.profileRelationship.update({ where: { id: row.id }, data: { status: action === "REMOVE" ? "REMOVED" : "REJECTED" } });
      } else throw fail("VALIDATION_ERROR", "Unsupported relationship action or state.");
    }
    await tx.auditLog.create({ data: { action: `PROFILE_RELATIONSHIP_${action}`, category: "USER_MANAGEMENT", entityType: "ProfileRelationship", entityId: row.publicId, description: `Authenticated user performed ${action} on a profile relationship.`, metadata: { actorId } } });
    return { id: row.publicId, type: row.type, status: row.status };
  }, { isolationLevel: "Serializable" });
}
