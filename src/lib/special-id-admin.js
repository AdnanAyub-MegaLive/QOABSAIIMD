import { occupiedSpecialId, retainActiveSpecialIds, publishSpecialIdentity } from './special-id-ownership.js';

const adminError = message => Object.assign(new Error(message), { name: "SpecialIdAdminError" });

// Historical rows remain for purchase/grant references and auditing.
export async function manageHistoricalSpecialId(db, admin, { assignmentId, action, publicId, durationMinutes, reason }) {
  const note = String(reason ?? '').trim();
  if (!note || note.length > 500) throw adminError('Enter a reason (maximum 500 characters).');
  if (!['DELETE', 'REASSIGN'].includes(action)) throw adminError('Invalid action.');
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030140)::text AS locked`;
    const previous = await tx.specialIdAssignment.findUnique({ where: { id: assignmentId } });
    if (!previous || !['EXPIRED', 'REVOKED', 'REPLACED'].includes(previous.status)) throw adminError('Only expired, revoked or replaced assignments can be managed here. Refresh and try again.');
    const now = new Date();
    const occupied = await tx.specialIdAssignment.findFirst({ where: { specialId: { equals: previous.specialId, mode: 'insensitive' }, ...occupiedSpecialId(now) } });
    let row, user;
    if (action === 'DELETE') {
      await tx.specialIdAssignment.update({ where: { id: previous.id }, data: { status: 'REMOVED' } });
      // Never disable a definition that another user currently owns.
      if (previous.definitionId && !occupied) await tx.specialIdDefinition.update({ where: { id: previous.definitionId }, data: { active: false, storeVisible: false } });
    } else {
      if (occupied) throw adminError('This ID is currently owned by a user. Revoke that assignment first.');
      const minutes = Number(durationMinutes);
      if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 5256000) throw adminError('Choose a valid duration (up to 10 years).');
      user = await tx.user.findUnique({ where: { publicId: String(publicId ?? '').trim().toUpperCase() } });
      if (!user || user.deletedAt || user.status !== 'ACTIVE') throw adminError('Active user not found. Enter their full normal public ID.');
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
      const definition = await tx.specialIdDefinition.upsert({ where: { code: previous.specialId }, update: { active: true }, create: { code: previous.specialId, category: 'STANDARD', defaultDurationMinutes: minutes } });
      await retainActiveSpecialIds(tx, user.id, now);
      row = await tx.specialIdAssignment.create({ data: { userId: user.id, definitionId: definition.id, specialId: definition.code, status: 'ACTIVE', source: 'ADMIN', startsAt: now, expiresAt: new Date(+now + minutes * 60000) } });
    }
    await tx.auditLog.create({ data: { adminId: admin.id, action: `${action}_HISTORICAL_SPECIAL_ID`, category: 'USER_MANAGEMENT', entityType: 'SpecialIdAssignment', entityId: previous.id, description: `${action === 'DELETE' ? 'Removed historical assignment for' : 'Reassigned'} Special ID ${previous.specialId}`, metadata: { reason: note, previousUserId: previous.userId, specialId: previous.specialId, ...(row ? { assignmentId: row.id, userId: user.id } : {}) } } });
    return { row, user };
  });
  if (result.row) await publishSpecialIdentity(result.user.id, result.user.publicId, result.row);
  return { success: true };
}
