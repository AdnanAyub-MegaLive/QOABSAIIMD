import { notifyGameCatalogUpdated } from './game-catalog-update.js';
const fail = (message, status, code) => Object.assign(new Error(message), {status, code});
// Catalogue lifecycle only: no settings, memberships, wallet or ledger writes.
export async function retireCatalogItem(db, admin, kind, input) {
  if (!admin) throw fail('Administrator authentication is required.', 401, 'UNAUTHORIZED');
  if (admin.role !== 'SUPER_ADMIN') throw fail('Only the Platform Admin can remove catalogue entries.', 403, 'FORBIDDEN');
  const id = typeof input?.id === 'string' ? input.id.trim() : '';
  const reason = typeof input?.reason === 'string' ? input.reason.trim() : '';
  if (!id || id.length > 200 || !reason || reason.length > 500) throw fail('An ID and a reason of 1–500 characters are required.', 422, 'VALIDATION_ERROR');
  if (!['game', 'notification'].includes(kind)) throw fail('Invalid catalogue.', 422, 'VALIDATION_ERROR');
  let changed = false;
  const result = await db.$transaction(async tx => {
    if (kind === 'game') await tx.$queryRaw`SELECT id FROM "GameDefinition" WHERE id = ${id} FOR UPDATE`;
    else await tx.$queryRaw`SELECT id FROM "Notification" WHERE "publicId" = ${id} FOR UPDATE`;
    const model = kind === 'game' ? tx.gameDefinition : tx.notification;
    const where = kind === 'game' ? {id} : {publicId:id};
    const row = await model.findUnique({where});
    if (!row) throw fail('Item not found.', 404, 'NOT_FOUND');
    const field = kind === 'game' ? 'archivedAt' : 'retractedAt';
    if (row[field]) return {id, [field]:row[field].toISOString()};
    const at = new Date();
    await model.update({where, data:{[field]:at}});
    changed = true;
    await tx.auditLog.create({data:{adminId:admin.id,action:kind === 'game' ? 'GAME_CATALOG_ARCHIVED' : 'NOTIFICATION_RETRACTED',category:kind === 'game' ? 'GAME_MANAGEMENT' : 'NOTIFICATIONS',entityType:kind === 'game' ? 'GameDefinition' : 'Notification',entityId:id,description:reason}});
    return {id, [field]:at.toISOString()};
  });
  if (kind === 'game' && changed) await notifyGameCatalogUpdated(db, [id]);
  return result;
}
