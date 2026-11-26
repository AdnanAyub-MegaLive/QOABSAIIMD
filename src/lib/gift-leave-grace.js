import { sharedRuntime } from './scaling/shared-runtime.js';
export const GIFT_LEAVE_GRACE_MS = 120_000;
export const GIFT_LEAVE_SLACK_MS = 5_000;
const SETTINGS_TTL_MS = 5_000;
const MAX_INTERVALS = 5;

function state() {
  globalThis.portalGiftLeaveGrace ??= { presence: new Map(), settings: { value: false, until: 0 } };
  return globalThis.portalGiftLeaveGrace;
}

export function resetGiftLeaveGrace() {
  delete globalThis.portalGiftLeaveGrace;
}

function roomIdOf(channel) {
  return typeof channel === "string" && channel.startsWith("audio-room:") ? channel.slice("audio-room:".length) : null;
}

function prune(intervals, now) {
  return intervals.filter((item) => item.leftAt === null || now - item.leftAt <= GIFT_LEAVE_GRACE_MS + GIFT_LEAVE_SLACK_MS).slice(-MAX_INTERVALS);
}

export function recordAudioRoomJoin(userId, channel, now = Date.now()) {
  const roomId = roomIdOf(channel);
  if (!userId || !roomId) return;
  const shared=sharedRuntime();if(shared)return shared.giftPresence(userId,roomId,'join',now);
  const { presence } = state();
  const key = `${userId}|${roomId}`;
  const intervals = prune(presence.get(key) ?? [], now);
  intervals.push({ joinedAt: now, leftAt: null });
  presence.set(key, intervals.slice(-MAX_INTERVALS));
}

export function recordAudioRoomLeave(userId, channel, now = Date.now()) {
  const roomId = roomIdOf(channel);
  if (!userId || !roomId) return;
  const shared=sharedRuntime();if(shared)return shared.giftPresence(userId,roomId,'leave',now);
  const { presence } = state();
  const key = `${userId}|${roomId}`;
  const intervals = presence.get(key) ?? [];
  const open = intervals.findLast((item) => item.leftAt === null);
  if (open) open.leftAt = now;
  const kept = prune(intervals, now);
  if (kept.length) presence.set(key, kept);
  else presence.delete(key);
}

export function markAudioRoomRemoved(userId, roomId) {
  if (!userId || !roomId) return;
  const shared=sharedRuntime();if(shared)return shared.giftPresence(userId,roomId,'remove');
  for (const item of state().presence.get(`${userId}|${roomId}`) ?? []) item.removed = true;
}

export function pruneGiftLeaveGrace(now = Date.now()) {
  const { presence } = state();
  for (const [key, intervals] of presence) {
    const kept = prune(intervals, now);
    if (kept.length) presence.set(key, kept);
    else presence.delete(key);
  }
}

export function parseTappedAt(value) {
  if (typeof value !== "string" || !value || value.length > 64) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function tappedWhilePresent(userId, roomId, tappedAtValue, now = Date.now()) {
  const tappedAt = parseTappedAt(tappedAtValue);
  if (tappedAt === null || !userId || !roomId) return false;
  if (tappedAt > now + GIFT_LEAVE_SLACK_MS) return false;
  const shared=sharedRuntime();if(shared)return shared.giftIntervals(userId,roomId).then(intervals=>validIntervals(intervals,tappedAt,now));
  const intervals = state().presence.get(`${userId}|${roomId}`) ?? [];
  return validIntervals(intervals,tappedAt,now);
}
function validIntervals(intervals,tappedAt,now) {
  return intervals.some((item) => item.leftAt !== null
    && !item.removed
    && now - item.leftAt <= GIFT_LEAVE_GRACE_MS
    && tappedAt >= item.joinedAt - GIFT_LEAVE_SLACK_MS
    && tappedAt <= item.leftAt + GIFT_LEAVE_SLACK_MS);
}

export async function giftLeaveGraceEnabled(db, now = Date.now()) {
  const cache = state().settings;
  if (cache.until > now) return cache.value;
  let value = false;
  try {
    const row = await db.giftLeaveGraceSettings.findUnique({ where: { id: "DEFAULT" }, select: { enabled: true } });
    value = row?.enabled === true;
  } catch {
    value = false;
  }
  state().settings = { value, until: now + SETTINGS_TTL_MS };
  return value;
}

export function invalidateGiftLeaveGraceSettings() {
  state().settings = { value: false, until: 0 };
}

export async function lateGiftSender(db, { senderId, roomId, tappedAt, participants }) {
  if (participants.has(senderId)) return false;
  if (tappedAt === undefined || tappedAt === null) return false;
  if (!(await giftLeaveGraceEnabled(db))) return false;
  return tappedWhilePresent(senderId, roomId, tappedAt);
}

export function attachGiftLeaveGraceTracking(io) {
  const adapter = io.of("/").adapter;
  const userOf = (socketId) => io.of("/").sockets.get(socketId)?.data?.userId ?? null;
  adapter.on("join-room", (channel, socketId) => { if (roomIdOf(channel)) Promise.resolve(recordAudioRoomJoin(userOf(socketId), channel)).catch(error=>console.error("Gift presence join deferred",error.code??error.name)); });
  adapter.on("leave-room", (channel, socketId) => { if (roomIdOf(channel)) Promise.resolve(recordAudioRoomLeave(userOf(socketId), channel)).catch(error=>console.error("Gift presence leave deferred",error.code??error.name)); });
  const timer = setInterval(() => pruneGiftLeaveGrace(), 60_000);
  timer.unref?.();
  return timer;
}

export function startRedEnvelopeRefundSweeper(db, expire, { intervalMs = 60_000, gate = fn => fn() } = {}) {
  let running = false;
  const run = async () => {
    if (running) return false;
    running = true;
    try {
      if (!(await giftLeaveGraceEnabled(db))) return false;
      await expire(null, new Date());
      return true;
    } catch (error) {
      console.error("Red envelope refund sweep failed", error?.code ?? error?.name);
      return false;
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void gate(run), intervalMs);
  timer.unref?.();
  return { timer, run };
}
