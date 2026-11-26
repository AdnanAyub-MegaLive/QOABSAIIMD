import { sharedRuntime } from './shared-runtime.js';
const tables = { realtimeOutbox: 'RealtimeOutbox', confirmedRealtimeEvent: 'ConfirmedRealtimeEvent' };
export async function withClaimedEvents(db, model, ids, callback) {
  const table = tables[model];
  if (!table) throw new Error('Unsupported outbox');
  const shared = sharedRuntime();
  if (shared && !shared.ready()) throw Object.assign(new Error('Realtime unavailable'), {code:'REDIS_UNAVAILABLE'});
  if (!shared) {
    const rows = await db[model].findMany({where:{deliveredAt:null,...(ids ? {id:{in:ids}} : {})},orderBy:[{createdAt:'asc'},{id:'asc'}],take:100});
    return callback(rows, db);
  }
  return db.$transaction(async tx => {
    // Table names are a closed allowlist; IDs remain bound parameters.
    const rows = ids
      ? await tx.$queryRawUnsafe(`SELECT * FROM "${table}" WHERE "deliveredAt" IS NULL AND id = ANY($1::text[]) ORDER BY "createdAt", id LIMIT 100 FOR UPDATE SKIP LOCKED`, ids)
      : await tx.$queryRawUnsafe(`SELECT * FROM "${table}" WHERE "deliveredAt" IS NULL ORDER BY "createdAt", id LIMIT 100 FOR UPDATE SKIP LOCKED`);
    return callback(rows, tx);
  }, {timeout:30000,maxWait:5000});
}
export async function emitDurable(io, channel, event, payload) {
  const shared = sharedRuntime();
  if (shared) return shared.publish(io, channel, event, payload);
  io.to(channel).emit(event,payload);
}
