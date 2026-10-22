import { prisma } from "./prisma.js";
import { versionMediaPayload } from "./media-payload.js";
import { refreshActivityEventMedia } from "./activity-event-media.js";
import { isGiftEvent } from "./gift-outbox-context.js";
import { getRoomGiftLeaderboard } from "./gift-leaderboard.js";

const key = Symbol.for("portal.outboxDispatchStates");
const states = globalThis[key] ??= new WeakMap();
function stateFor(io) {
  // Bundled routes and the custom server can have different Prisma wrappers.
  // They share the same Socket.IO instance and must share dispatch ownership.
  if (!states.has(io)) states.set(io, { running: null, again: false, inFlight: new Set(), emitted: new Map() });
  return states.get(io);
}
export async function deliverCommittedGiftEvents(rows, io = globalThis.portalIo, db = prisma) {
  if (!io || !rows.length) return;
  await deliver(rows.filter(row => isGiftEvent(row.event)), io, db);
}
async function deliver(rows, io, db) {
  const state = stateFor(io);
  const now = Date.now();
  for (const [id, at] of state.emitted) if (now - at > 300000) state.emitted.delete(id);
  const owned = rows.filter(row => !state.inFlight.has(row.id));
  for (const row of owned) state.inFlight.add(row.id);
  const delivered = [], failed = [];
  const leaderboards = new Map();
  try {
    // No asset lookup or deliveredAt write can delay a gift in this batch.
    const ordered = [...owned.filter(row => isGiftEvent(row.event)), ...owned.filter(row => !isGiftEvent(row.event))];
    for (const row of ordered) {
      try {
        // A stale poll or failed delivery-marker write must not emit again.
        // Still retry the marker write so durable fallback can make progress.
        if (state.emitted.has(row.id)) { delivered.push(row.id); continue; }
        let payload = { ...row.payload, data: { ...row.payload.data, eventId: row.id } };
        if (!isGiftEvent(row.event)) {
          if (row.event === "audio-room:gift-leaderboard" && payload.data.refreshLeaderboard) {
            const { roomId, origin } = payload.data;
            const key = JSON.stringify([roomId, origin]);
            if (!leaderboards.has(key)) leaderboards.set(key, getRoomGiftLeaderboard(roomId, origin, db));
            payload = { ...payload, data: { roomId, ...await leaderboards.get(key), eventId: row.id } };
          }
          if (row.event === "activity-progression:updated") payload = await refreshActivityEventMedia(payload, db);
          payload = await versionMediaPayload(payload, db);
        }
        io.to(row.channel).emit(row.event, payload);
        state.emitted.set(row.id, Date.now());
        if (state.emitted.size > 20000) state.emitted.delete(state.emitted.keys().next().value);
        delivered.push(row.id);
      } catch (error) {
        failed.push(row.id);
        console.error("Realtime outbox delivery failed", row.id, error.message);
      }
    }
    if (delivered.length) await db.realtimeOutbox.updateMany({ where: { id: { in: delivered }, deliveredAt: null }, data: { deliveredAt: new Date(), attempts: { increment: 1 } } });
    if (failed.length) await db.realtimeOutbox.updateMany({ where: { id: { in: failed }, deliveredAt: null }, data: { attempts: { increment: 1 } } });
  } finally { for (const row of owned) state.inFlight.delete(row.id); }
  return delivered.length;
}
export function flushRealtimeOutbox(io = globalThis.portalIo, db = prisma) {
  if (!io) return Promise.resolve();
  const state = stateFor(io);
  if (state.running) { state.again = true; return state.running; }
  state.running = (async () => {
    try {
      do {
        state.again = false;
        const rows = await db.realtimeOutbox.findMany({ where: { deliveredAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100 });
        const sent = await deliver(rows, io, db);
        // Drain successful full batches immediately; failed-only batches wait
        // for the timer instead of creating a tight retry loop.
        if (rows.length === 100 && sent) state.again = true;
      } while (state.again);
    } finally { state.running = null; }
  })();
  return state.running;
}
