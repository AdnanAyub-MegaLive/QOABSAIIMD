import { afterEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { defaultPrettyLevels, prettyWeek, qualification, validatePrettyLevels } from './pretty-id-policy.js';
import { prettyRechargeSql, decidePrettyMaintenance, maintainPrettyIds } from './pretty-id-weekly.js';
import { fitsPattern, activatePrettyId, claimPrettyId } from './pretty-id.js';
afterEach(() => vi.useRealTimers());
it('uses Monday UTC half-open weeks across year boundaries', () => {
  expect(prettyWeek(new Date('2027-01-03T23:59:59.999Z'))).toEqual({ start: new Date('2026-12-28T00:00:00Z'), end: new Date('2027-01-04T00:00:00Z') });
  expect(prettyWeek(new Date('2027-01-04T00:00:00Z')).start.toISOString()).toBe('2027-01-04T00:00:00.000Z');
});
it('grants only highest qualifying level after voluntary maintenance allocation', () => {
  expect(qualification(defaultPrettyLevels, 10000000n, 0n).characters).toBe(5);
  expect(qualification(defaultPrettyLevels, 25000000n, 3000000n).characters).toBe(4);
  expect(qualification(defaultPrettyLevels, 28000000n, 3000000n).characters).toBe(3);
  expect(qualification(defaultPrettyLevels, 250000n, 250000n)).toBeNull();
});
it('validates exact large amounts and format lengths without floating point', () => {
  const levels = defaultPrettyLevels.map((r, i) => ({ ...r, thresholdCoins: String(9007199254740993n + BigInt(i)) }));
  expect(validatePrettyLevels(levels)[0].thresholdCoins).toBe('9007199254740993');
  expect(() => validatePrettyLevels([{ ...defaultPrettyLevels[0], pattern: 'BAD' }, ...defaultPrettyLevels.slice(1)])).toThrow();
  for (const code of ['XXXZZZZ', '1113333', 'XXX1111']) expect(fitsPattern('BBBCCCC', code)).toBe(true);
  expect(fitsPattern('BBBCCCC', 'XXXXXXX')).toBe(false);
  expect(fitsPattern('BCC', 'A11')).toBe(true);
});
it('counts only confirmed recharge, excludes bonuses and respects exact boundaries', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "WalletTransaction" ("userId" text,type text,direction text,status text,coins bigint,"referenceId" text,metadata jsonb,"createdAt" timestamp);
      CREATE TABLE "WalletTopUpOrder" ("publicId" text PRIMARY KEY,"userId" text,status text,"baseCoins" bigint);
      INSERT INTO "WalletTopUpOrder" VALUES ('topup','u','COMPLETED',1000000),('failed','u','FAILED',1000000);`);
    const add = (type, coins, ref, metadata = {}, at = '2026-11-09T00:00:00Z', status = 'COMPLETED', direction = 'CREDIT') => db.query('INSERT INTO "WalletTransaction" VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', ['u', type, direction, status, String(coins), ref, JSON.stringify(metadata), at]);
    await add('COIN_TOP_UP', 1200000, 'topup'); // 200k bonus excluded
    await add('COIN_TOP_UP', 1000000, 'failed');
    await add('TRANSFER_RECEIVED', 5000000, 'reseller', { wallet: 'PERSONAL' });
    await add('TRANSFER_SENT', 5000000, 'reseller', { wallet: 'BUSINESS' }, undefined, 'COMPLETED', 'DEBIT');
    await add('TRANSFER_SENT', 5000000, 'reseller', { wallet: 'BUSINESS' }, undefined, 'COMPLETED', 'DEBIT'); // EXISTS avoids multiplying
    await add('TRANSFER_RECEIVED', 9000000, 'unproven', { wallet: 'PERSONAL' });
    await add('BONUS', 9999999, 'bonus'); await add('ADMIN_ADJUSTMENT', 9999999, 'admin');
    await add('COIN_TOP_UP', 1200000, 'topup', {}, '2026-11-16T00:00:00Z');
    await add('COIN_TOP_UP', 1200000, 'topup', {}, '2026-11-08T23:59:59Z');
    await add('COIN_TOP_UP', 1200000, 'topup', {}, undefined, 'REVERSED');
    const query = prettyRechargeSql(new Date('2026-11-09'), new Date('2026-11-16'), 'u');
    const result = (await db.query(query.text, query.values)).rows;
    expect(BigInt(result[0].coins)).toBe(6000000n);
  } finally { await db.close(); }
}, 30000);

// Transactional state double: all operations are serialized and a thrown error
// restores the snapshot. No real database or wallet is reachable from these tests.
function fixture() {
  const state = { grants: [1, 2].map(i => ({ id: `g${i}`, userId: 'u', pattern: 'BCC', durationMinutes: 43200, maintenanceCoins: 250000n, assignmentId: `a${i}` })),
    assignments: [1, 2].map(i => ({ id: `a${i}`, userId: 'u', source: 'PRETTY_ID', specialId: `A${i}${i}`, status: i === 1 ? 'ACTIVE' : 'OWNED', revokedAt: null, startsAt: new Date('2026-11-01'), expiresAt: new Date('2026-12-01') })), decisions: [], recharge: 250000n };
  const db = {
    $queryRaw: vi.fn(async q => Array.isArray(q) ? [] : [{ userId: 'u', coins: state.recharge }]),
    user: { findUnique: async () => ({ publicId: 'USR-QA', status: 'ACTIVE', deletedAt: null }) },
    prettyIdPolicy: { findFirst: async () => ({ enabled: true, levels: defaultPrettyLevels }) },
    prettyIdGrant: {
      findFirst: async ({ where }) => { const g = state.grants.find(g => g.id === where.id && g.userId === where.userId); return g ? { ...g, assignment: state.assignments.find(a => a.id === g.assignmentId), user: { publicId: 'USR-QA', status: 'ACTIVE' } } : null; },
      update: async ({ where, data }) => Object.assign(state.grants.find(g => g.id === where.id), data),
    },
    prettyIdMaintenance: {
      findUnique: async ({ where }) => state.decisions.find(d => d.grantId === where.grantId_weekStart.grantId && +d.weekStart === +where.grantId_weekStart.weekStart),
      aggregate: async () => ({ _sum: { coins: state.decisions.filter(d => d.accepted).reduce((n, d) => n + d.coins, 0n) } }),
      create: async ({ data }) => { state.decisions.push(data); return data; },
    },
    publicNumberReservation: { findMany: async () => [] }, specialIdDefinition: { findMany: async () => [] },
    specialIdAssignment: {
      findMany: async () => [],
      update: async ({ where, data }) => Object.assign(state.assignments.find(a => a.id === where.id), data),
      updateMany: async ({ where, data }) => { for (const a of state.assignments) if (a.userId === where.userId && a.status === where.status && a.id !== where.id?.not && (typeof where.source === 'string' ? a.source === where.source : a.source !== where.source.not)) Object.assign(a, data); },
      create: async ({ data }) => { const a = { ...data, id: `a${state.assignments.length + 1}` }; state.assignments.push(a); return a; },
    },
  };
  let queue = Promise.resolve();
  db.$transaction = fn => { const result = queue.then(async () => { const before = structuredClone(state); try { return await fn(db); } catch (e) { Object.assign(state, before); throw e; } }); queue = result.catch(() => {}); return result; };
  return { db, state };
}
function clock() { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-10T12:00:00Z')); return '2026-11-09T00:00:00.000Z'; }
it('acceptance allocates once; lost-response retry is stable even after week closes', async () => {
  const week = clock(), { db, state } = fixture();
  const first = await decidePrettyMaintenance(db, 'u', 'g1', week, true);
  expect(first.expiresAt).toEqual(new Date('2026-12-31'));
  vi.setSystemTime(new Date('2026-11-17'));
  expect(await decidePrettyMaintenance(db, 'u', 'g1', week, true)).toEqual(first);
  expect(state.decisions).toHaveLength(1); expect(state.recharge).toBe(250000n);
  await expect(decidePrettyMaintenance(db, 'u', 'g1', week, false)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
});
it('decline leaves all allowance available and concurrent acceptances cannot double allocate', async () => {
  const week = clock(), first = fixture();
  await decidePrettyMaintenance(first.db, 'u', 'g1', week, false);
  expect(first.state.assignments[0].expiresAt).toEqual(new Date('2026-12-01'));
  await decidePrettyMaintenance(first.db, 'u', 'g2', week, true);
  const { db, state } = fixture();
  const results = await Promise.allSettled(['g1', 'g2'].map(id => decidePrettyMaintenance(db, 'u', id, week, true)));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(r => r.status === 'rejected').reason.code).toBe('INSUFFICIENT_RECHARGE');
  expect(state.decisions).toHaveLength(1);
});
it('blocks foreign, expired and closed-week maintenance', async () => {
  const week = clock(), { db, state } = fixture();
  await expect(decidePrettyMaintenance(db, 'other', 'g1', week, true)).rejects.toMatchObject({ code: 'PRETTY_ID_UNAVAILABLE' });
  await expect(decidePrettyMaintenance(db, 'u', 'g1', '2026-11-02', true)).rejects.toMatchObject({ code: 'WEEK_CLOSED' });
  state.assignments[0].expiresAt = new Date('2026-11-01');
  await expect(decidePrettyMaintenance(db, 'u', 'g1', week, true)).rejects.toMatchObject({ code: 'NOT_RENEWABLE' });
});
it('claim reserves without starting expiry; activation starts once; switching keeps both timers', async () => {
  clock(); const { db, state } = fixture(); state.grants[1].assignmentId = null;
  const claimed = await claimPrettyId(db, 'u', 'g2', 'z33');
  expect(claimed.expiresAt).toBeNull(); expect(claimed.activationRequired).toBe(true);
  expect(state.assignments[0].status).toBe('ACTIVE');
  expect(await claimPrettyId(db, 'u', 'g2', 'Z33')).toEqual(claimed);
  await expect(claimPrettyId(db, 'u', 'g2', 'Z44')).rejects.toMatchObject({ code: 'PRETTY_ID_UNAVAILABLE' });
  const activated = await activatePrettyId(db, 'u', 'g2');
  expect(activated.expiresAt).toBe('2026-12-10T12:00:00.000Z');
  expect(state.assignments[0].status).toBe('OWNED');
  await activatePrettyId(db, 'u', 'g1'); vi.setSystemTime(new Date('2026-11-11'));
  expect((await activatePrettyId(db, 'u', 'g2')).expiresAt).toBe(activated.expiresAt);
  expect(state.assignments[0].expiresAt).toEqual(new Date('2026-12-01'));
});
it('weekly worker does nothing before configured activation or without a policy', async () => {
  clock(); const transaction = vi.fn();
  await maintainPrettyIds({ prettyIdPolicy: { findFirst: async () => null }, $transaction: transaction });
  await maintainPrettyIds({ prettyIdPolicy: { findFirst: async () => ({ effectiveFrom: new Date('2026-11-16') }) }, prettyIdWeek: { findFirst: async () => null }, $transaction: transaction });
  expect(transaction).not.toHaveBeenCalled();
});

it('closes weeks once, applies maintenance before qualification and grants again next week', async () => {
  clock(); vi.setSystemTime(new Date('2026-11-24T00:10:00Z'));
  const weeks = [], grants = [], notifications = [];
  const db = {
    $queryRaw: async q => Array.isArray(q) ? [] : [{ userId: 'u', coins: 28000000n }],
    prettyIdPolicy: { findFirst: async () => ({ effectiveFrom: new Date('2026-11-09'), enabled: true, levels: defaultPrettyLevels }) },
    prettyIdWeek: {
      findFirst: async () => weeks.at(-1) ?? null,
      upsert: async ({ where }) => { let week = weeks.find(w => +w.start === +where.start); if (!week) { week = { start: where.start, cursor: '' }; weeks.push(week); } return week; },
      update: async ({ where, data }) => Object.assign(weeks.find(w => +w.start === +where.start), data),
    },
    user: { findUnique: async () => ({ status: 'ACTIVE', deletedAt: null }) },
    prettyIdMaintenance: { aggregate: async () => ({ _sum: { coins: 3000000n } }) },
    prettyIdGrant: {
      findUnique: async ({ where }) => grants.find(g => g.userId === where.userId_weekStart.userId && +g.weekStart === +where.userId_weekStart.weekStart),
      create: async ({ data }) => { const grant = { ...data, id: `g${grants.length}` }; grants.push(grant); return grant; },
    },
    notification: { upsert: async ({ create }) => notifications.push(create) },
  };
  db.$transaction = fn => fn(db);
  await maintainPrettyIds(db); // first completed week
  weeks[0].completedAt = null; weeks[0].cursor = ''; // simulates replay of a page
  await maintainPrettyIds(db);
  expect(grants).toHaveLength(1); expect(notifications).toHaveLength(1);
  expect(grants[0]).toMatchObject({ level: 5, pattern: 'BCC', source: 'WEEKLY_RECHARGE' });
  await maintainPrettyIds(db); // second completed week
  expect(grants).toHaveLength(2); expect(notifications).toHaveLength(2);
  await maintainPrettyIds(db); expect(grants).toHaveLength(2); // current week not closed
});

it('migration preserves old grants and enforces unique weekly grants and maintenance receipts', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "PrettyIdGrant" (id text PRIMARY KEY,"userId" text);
      INSERT INTO "PrettyIdGrant" VALUES ('legacy','u');`);
    await db.exec(await readFile(new URL('../../prisma/migrations/20261103190000_weekly_pretty_ids/migration.sql', import.meta.url), 'utf8'));
    const legacy = (await db.query('SELECT * FROM "PrettyIdGrant"')).rows[0];
    expect(legacy).toMatchObject({ id: 'legacy', source: 'MANUAL', weekStart: null });
    await db.exec(`INSERT INTO "PrettyIdGrant" (id,"userId","weekStart") VALUES ('first','u','2026-11-09');`);
    await expect(db.exec(`INSERT INTO "PrettyIdGrant" (id,"userId","weekStart") VALUES ('duplicate','u','2026-11-09');`)).rejects.toMatchObject({ code: '23505' });
    await db.exec(`INSERT INTO "PrettyIdMaintenance" (id,"grantId","weekStart",accepted,coins,"expiresAt") VALUES ('decision','first','2026-11-09',true,250000,'2026-12-01');`);
    await expect(db.exec(`INSERT INTO "PrettyIdMaintenance" (id,"grantId","weekStart",accepted,coins,"expiresAt") VALUES ('retry','first','2026-11-09',true,250000,'2026-12-31');`)).rejects.toMatchObject({ code: '23505' });
    await db.exec(`CREATE TABLE "PublicNumberReservation" (number text PRIMARY KEY,kind text);
      CREATE TABLE "SpecialIdAssignment" (id text PRIMARY KEY,"specialId" text,status text,"revokedAt" timestamp,"expiresAt" timestamp);
      CREATE TRIGGER guard_special_assignment BEFORE INSERT OR UPDATE ON "SpecialIdAssignment" FOR EACH ROW EXECUTE FUNCTION guard_special_assignment();
      INSERT INTO "SpecialIdAssignment" VALUES ('claimed','1113333','CLAIMED',NULL,NULL),('owned','ABC','OWNED',NULL,NULL);`);
    expect((await db.query(`SELECT kind FROM "PublicNumberReservation" WHERE number='1113333'`)).rows[0].kind).toBe('SPECIAL');
    await expect(db.exec(`INSERT INTO "SpecialIdAssignment" VALUES ('other','abc','ACTIVE',NULL,NULL)`)).rejects.toThrow('SPECIAL_ID_ALREADY_ASSIGNED');
    await db.exec(`INSERT INTO "PublicNumberReservation" VALUES ('2224444','NORMAL')`);
    await expect(db.exec(`INSERT INTO "SpecialIdAssignment" VALUES ('collision','2224444','CLAIMED',NULL,NULL)`)).rejects.toThrow('SPECIAL_ID_CONFLICTS_WITH_NORMAL_ID');
  } finally { await db.close(); }
}, 30000);
