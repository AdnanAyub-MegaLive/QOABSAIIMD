import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../prisma.js', () => ({ prisma: {} }));
import { activeGameSchedule, scheduleGameSettings } from './shared-schedule.js';
import { sharedClock, sharedDuration, sharedOutcome, DAY_MS } from './shared-engine.mjs';
import { resolveSharedEntry } from './shared-games.js';
import { rocketCrashAt } from './rocket.mjs';
let pg;
const start = Date.parse('2026-10-30T00:00:00Z');
const game = { id: 'flip', engine: 'flip', name: 'Flip', revision: 1, status: 'active', minBet: 10, maxBet: 1000, winProbability: 100, payoutMultiplier: 2, outcomeScope: 'application-v1' };
const original = { id: 'flip:2026-10-30', gameId: 'flip', day: new Date(start), settings: game, seed: 'original-seed', durationMs: 40000 };
function adapter(sql) {
  return { sharedGameDay: {
    findFirst: async ({ where }) => (await sql.query('SELECT * FROM schedules WHERE "gameId"=$1 AND day >= $2 AND day <= $3 ORDER BY day DESC LIMIT 1', [where.gameId, where.day.gte, where.day.lte])).rows[0] ?? null,
    findUnique: async ({ where }) => (await sql.query('SELECT * FROM schedules WHERE id=$1', [where.id])).rows[0] ?? null,
    upsert: async ({ create, update }) => (await sql.query(`INSERT INTO schedules VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (id) DO UPDATE SET settings=$7,"durationMs"=$8 RETURNING *`, [create.id, create.gameId, create.day, JSON.stringify(create.settings), create.seed, create.durationMs, JSON.stringify(update.settings), update.durationMs])).rows[0],
    deleteMany: async ({ where }) => sql.query('DELETE FROM schedules WHERE "gameId"=$1 AND day>$2 AND day<$3', [where.gameId, where.day.gt, where.day.lt]),
  } };
}
async function insert(row) { await pg.query('INSERT INTO schedules VALUES ($1,$2,$3,$4,$5,$6)', [row.id, row.gameId, row.day, JSON.stringify(row.settings), row.seed, row.durationMs]); }
const save = (settings, now) => pg.transaction(tx => scheduleGameSettings(adapter(tx), settings, now));
const active = now => activeGameSchedule(adapter(pg), 'flip', now);
beforeAll(async () => { pg = new PGlite(); await pg.exec('CREATE TABLE schedules(id TEXT PRIMARY KEY,"gameId" TEXT,day TIMESTAMPTZ,settings JSONB,seed TEXT,"durationMs" INT,UNIQUE("gameId",day));'); });
beforeEach(async () => { await pg.exec('TRUNCATE schedules'); await insert(original); });
afterAll(async () => { await pg.close(); });

it('activates changed rules at the next round across rooms, preserving existing settlement', async () => {
  const old = await active(start + 1000);
  const before = sharedOutcome(old, 'ROOM-A', 0);
  expect(await save({ ...game, revision: 2, winProbability: 0, payoutMultiplier: 3, selectionSeconds: 5 }, start + 1000)).toBe(start + 40000);
  expect((await active(start + 39999)).id).toBe(old.id);
  const next = await active(start + 40000);
  expect(next.settings.revision).toBe(2);
  expect(sharedClock(next, start + 40000)).toMatchObject({ roundNumber: 2, totalRounds: 1, slot: 0, closesAt: start + 45000 });
  expect(sharedOutcome(next, 'ROOM-A', 0)).toEqual(sharedOutcome(next, 'ROOM-B', 0));
  expect(sharedOutcome(next, 'ROOM-A', 0).result).toBe('tails');
  const saved = await adapter(pg).sharedGameDay.findUnique({ where: { id: old.id } });
  expect(saved).toEqual(old); expect(sharedOutcome(saved, 'ROOM-A', 0)).toEqual(before);
  expect(resolveSharedEntry({ day: saved, roomId: 'ROOM-A', slot: 0, amount: 100n, input: { currency: 'COINS', choice: 'heads' } }).payout).toBe(200);
});
it('coalesces saves before activation and polling does not write again', async () => {
  await save({ ...game, revision: 2 }, start + 1000);
  await save({ ...game, revision: 3, minBet: 100 }, start + 2000);
  const db = adapter(pg); db.sharedGameDay.upsert = vi.fn(db.sharedGameDay.upsert);
  await scheduleGameSettings(db, { ...game, revision: 3, minBet: 100 }, start + 3000);
  expect(db.sharedGameDay.upsert).not.toHaveBeenCalled();
  expect((await active(start + 40000)).settings).toMatchObject({ revision: 3, minBet: 100 });
  expect((await pg.query('SELECT count(*) FROM schedules')).rows[0].count).toBe(2);
});
it('later edits keep round counters continuous and previous schedules immutable', async () => {
  await save({ ...game, revision: 2, selectionSeconds: 5 }, start + 1000);
  const second = await active(start + 40000);
  await save({ ...game, revision: 3, selectionSeconds: 10 }, start + 70000);
  expect(await active(start + 70000)).toEqual(second);
  expect(sharedClock(await active(start + 90000), start + 90000)).toMatchObject({ roundNumber: 4, slot: 0, totalRounds: 3, resetAt: start + DAY_MS });
});
it('does not replay old outcomes or change rocket cash-out timing during a flight', async () => {
  const rocket = { ...game, engine: 'rocket', outcomeWeights: [0,0,0,0,0,1], rocketMaxMultiplier: 5 };
  await pg.exec('TRUNCATE schedules'); await insert({ ...original, settings: rocket });
  const flight = await active(start + 24000), crash = rocketCrashAt(flight, 0, 500);
  await save({ ...rocket, revision: 2, rocketMaxMultiplier: 1, outcomeWeights: [1,0], playingSeconds: 1 }, start + 24000);
  expect(rocketCrashAt(await active(start + 25000), 0, 500)).toBe(crash);
  expect((await active(start + 40000)).settings.rocketMaxMultiplier).toBe(1);
});
it('defers changes that cannot fit before midnight and removes superseded future settings', async () => {
  await save({ ...game, revision: 2, selectionSeconds: 1, playingSeconds: 1, resultSeconds: 1 }, start + DAY_MS - 41000);
  expect((await pg.query('SELECT count(*) FROM schedules')).rows[0].count).toBe(2);
  expect(await save({ ...game, revision: 3, selectionSeconds: 3600 }, start + DAY_MS - 40500)).toBe(start + DAY_MS);
  expect((await pg.query('SELECT count(*) FROM schedules')).rows[0].count).toBe(1);
  expect(await active(start + DAY_MS)).toBeNull();
});
it('rolls back the new schedule with a failed settings transaction', async () => {
  await expect(pg.transaction(async tx => { await scheduleGameSettings(adapter(tx), { ...game, revision: 2 }, start + 1000); throw Error('audit failed'); })).rejects.toThrow('audit failed');
  expect((await active(start + 40000)).settings.revision).toBe(1);
});
it('uses latest settings on first play with no unnecessary future schedule', async () => {
  await pg.exec('TRUNCATE schedules');
  expect(await save({ ...game, revision: 2 }, start + 1000)).toBeNull();
});
it('never extends a revised schedule past the UTC day', async () => {
  const settings = { ...game, selectionSeconds: 7, scheduleRoundOffset: 100 };
  const day = { ...original, settings, day: new Date(start + DAY_MS - 60000), durationMs: sharedDuration(settings) };
  expect(sharedClock(day, start + DAY_MS - 1)).toMatchObject({ phase: 'reset', resetAt: start + DAY_MS, totalRounds: 102 });
});
it('normal polling reads a scheduled revision without mutation or a game lock', async () => {
  const updated = { ...game, revision: 2 }, db = adapter(pg), current = await active(start + 1000);
  db.sharedGameDay.upsert = vi.fn(db.sharedGameDay.upsert);
  expect(await scheduleGameSettings(db, updated, start + 1000, current, true)).toBeUndefined();
  expect(db.sharedGameDay.upsert).not.toHaveBeenCalled();
  await save(updated, start + 1000);
  expect(await scheduleGameSettings(db, updated, start + 2000, current, true)).toBe(start + 40000);
  expect(db.sharedGameDay.upsert).not.toHaveBeenCalled();
});
