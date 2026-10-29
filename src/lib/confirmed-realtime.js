import { createHash } from 'node:crypto';
// Numeric events have their own worker: never wait behind media or leaderboards.
const states = new WeakMap();
const folds = new WeakMap();
export function foldRoomGiftTotals(db) {
  if (folds.has(db)) return folds.get(db);
  const running = db.$queryRaw`SELECT portal_fold_room_gift_deltas(NULL) AS folded`.finally(() => folds.delete(db));
  folds.set(db, running);
  return running;
}
export function flushConfirmedRealtime(db, io, telemetry = () => {}, trigger = 'fallback') {
  if (!io) return Promise.resolve();
  let state = states.get(io);
  if (!state) { state = { running: null, again: false, emitted: new Map() }; states.set(io, state); }
  if (state.running) { state.again = true; return state.running; }
  state.running = (async () => {
    do {
      state.again = false;
      const rows = await db.confirmedRealtimeEvent.findMany({ where: { deliveredAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100 });
      const ids = [...new Set(rows.flatMap(r => r.userId ? [r.userId] : Object.keys(r.payload.changedRecipients ?? {})))];
      const users = ids.length ? await db.user.findMany({ where: { id: { in: ids }, status: 'ACTIVE', deletedAt: null }, select: { id: true, publicId: true } }) : [];
      const byId = new Map(users.map(u => [u.id, u.publicId]));
      const delivered = [];
      for (const row of rows) {
        try {
          if (!state.emitted.has(row.id)) {
            const data = { ...row.payload, eventId: createHash('sha256').update(row.id).digest('hex') };
            let channel;
            if (row.event === 'wallet:updated') {
              const publicId = byId.get(row.userId);
              if (!publicId) { delivered.push(row.id); continue; }
              data.userId = publicId; channel = `user:${publicId}`;
            } else if (row.event === 'audio-room:gift-totals') {
              data.recipients = Object.entries(data.changedRecipients ?? {}).filter(([id]) => byId.has(id))
                .map(([id, coins]) => ({ userId: byId.get(id), receivedGiftCoins: coins, revision: data.roomTotalsRevision }));
              delete data.changedRecipients;
              data.recipientScope = 'CHANGED'; data.scope = 'ALL_TIME_RECORDED_GIFT_COINS';
              channel = `audio-room:${row.roomId}`;
            } else throw new Error('Unsupported confirmed event');
            io.to(channel).emit(row.event, { success: true, data });
            state.emitted.set(row.id, Date.now());
            telemetry({ stage: 'confirmed_emit', trigger, eventId: data.eventId, event: row.event, emittedAt: new Date().toISOString(), persistedToEmitMs: Date.now() - row.createdAt.getTime() });
          }
          delivered.push(row.id);
        } catch (error) { console.error('Confirmed realtime emit failed', { eventId: row.id, code: error.code ?? 'EMIT_FAILED' }); }
      }
      if (delivered.length) await db.confirmedRealtimeEvent.updateMany({ where: { id: { in: delivered }, deliveredAt: null }, data: { deliveredAt: new Date(), attempts: { increment: 1 } } });
      const cutoff = Date.now() - 300000;
      for (const [id, time] of state.emitted) if (time < cutoff) state.emitted.delete(id);
      if (state.emitted.size > 20000) state.emitted.delete(state.emitted.keys().next().value);
      if (rows.length === 100 && delivered.length === rows.length) state.again = true;
    } while (state.again);
  })().finally(() => { state.running = null; });
  return state.running;
}

export async function roomGiftTotalsSnapshot(db, roomId) {
  await db.$queryRaw`SELECT portal_fold_room_gift_deltas(${roomId}) AS folded`;
  return db.$transaction(async tx => {
    const total = await tx.roomGiftTotal.findUnique({ where: { roomId } });
    const recipients = await tx.roomRecipientGiftTotal.findMany({ where: { roomId, coins: { not: 0n } } });
    const users = recipients.length ? await tx.user.findMany({ where: { id: { in: recipients.map(r => r.userId) }, status: 'ACTIVE', deletedAt: null }, select: { id: true, publicId: true } }) : [];
    const ids = new Map(users.map(u => [u.id, u.publicId]));
    const pending = await tx.roomGiftDelta.findFirst({ where: { roomId, processedAt: null }, select: { id: true } });
    return { roomId, pendingUpdates: Boolean(pending), scope: 'ALL_TIME_RECORDED_GIFT_COINS', recipientScope: 'ALL', roomTotalsRevision: String(total?.revision ?? 0n), roomTotalCoins: String(total?.coins ?? 0n),
      recipients: recipients.filter(r => ids.has(r.userId)).map(r => ({ userId: ids.get(r.userId), receivedGiftCoins: String(r.coins), revision: String(total?.revision ?? 0n) })), serverTime: new Date().toISOString() };
  }, { isolationLevel: 'RepeatableRead' });
}
