import { PGlite } from '@electric-sql/pglite';
import { expect, it, vi } from 'vitest';
vi.mock('./prisma.js', () => ({ prisma: {} }));
vi.mock('./progression.js', () => ({ jsonSafe: value => value }));
vi.mock('./gift-refunds.js', () => ({ recordGiftRecovery: vi.fn() }));
vi.mock('./realtime-outbox.js', () => ({ deliverCommittedGiftEvents: vi.fn(async () => {}), flushRealtimeOutbox: vi.fn() }));
import { comboBatchOperation } from './gift-combo-batch.js';
import { runGiftOperation, giftOperation } from './gift-operation.js';
import { settleLuckyRewards, flushLuckyPoolSession } from './lucky-gifts.js';

const body = { roomId: 'ROOM-1', giftId: 'AST-1', recipientIds: ['USR-A'], comboId: 'combo-1' };
const batch = (key, tapIds, changes = {}) => comboBatchOperation({ ...body, tapIds, ...changes }, key);

it('bounds batches and shares per-tap idempotency with multi sends', () => {
  const op = batch('batch-001', ['tap-0001', 'tap-0002']);
  expect(op.taps[0].fingerprint).toBe(giftOperation(body, 'tap-0001', 'MULTI').fingerprint);
  expect(op.taps[0].fingerprint).not.toBe(giftOperation(body, 'tap-0001', 'PAID').fingerprint);
  for (const ids of [[], ['tap-0001', 'tap-0001'], ['short'], ['batch-001'], Array.from({ length: 9 }, (_, i) => `tap-000${i}`)])
    expect(() => batch('batch-001', ids)).toThrow();
  expect(() => batch('batch-001', ['tap-0001', 'tap-0002', 'tap-0003'], { recipientIds: Array.from({ length: 26 }, (_, i) => `U${i}`) })).toThrow();
  expect(() => batch('batch-001', ['tap-0001'], { bagItemId: 'AST-1' })).toThrow();
  expect(batch('batch-001', ['tap-0002', 'tap-0001']).fingerprint).not.toBe(op.fingerprint);
});

it('commits tap results once across overlapping retries; failures roll back all new taps', async () => {
  const pg = new PGlite();
  let transactions = 0;
  try {
    await pg.exec(`CREATE TABLE requests(sender TEXT, key TEXT, fingerprint TEXT, result JSONB, PRIMARY KEY(sender,key));
      CREATE TABLE wallet(id TEXT PRIMARY KEY, coins BIGINT); INSERT INTO wallet VALUES ('qa',1000);
      CREATE TABLE effects(tap TEXT PRIMARY KEY, debit BIGINT, reward BIGINT);`);
    const db = { $transaction: async (fn, options) => {
      expect(options.isolationLevel).toBe('Serializable'); transactions++;
      return pg.transaction(async sql => fn({
        sql,
        giftRequest: {
          findUnique: async ({ where: { senderId_key: { senderId, key } } }) => (await sql.query('SELECT fingerprint,result FROM requests WHERE sender=$1 AND key=$2', [senderId, key])).rows[0],
          create: async ({ data }) => sql.query('INSERT INTO requests VALUES ($1,$2,$3,$4)', [data.senderId, data.key, data.fingerprint, JSON.stringify(data.result)]),
        },
        user: { findUniqueOrThrow: async () => ({ coinBalance: BigInt((await sql.query('SELECT coins FROM wallet')).rows[0].coins) }) },
      }));
    } };
    const work = vi.fn(async (tx, tap) => {
      const debit = await tx.sql.query('UPDATE wallet SET coins=coins-100 WHERE coins>=100 RETURNING coins');
      if (!debit.rows.length) throw Error('INSUFFICIENT_COINS');
      await tx.sql.query('INSERT INTO effects VALUES ($1,100,10)', [tap.key]);
      await tx.sql.exec('UPDATE wallet SET coins=coins+10');
      return { requestId: tap.key, luckyRewardCoins: '10' };
    });
    const first = batch('batch-001', ['tap-0001', 'tap-0002']);
    const result = await runGiftOperation('qa', first, work, db);
    expect(transactions).toBe(1);
    expect(result.senderCoinBalance).toBe('820');
    expect(result.taps.map(t => t.tapId)).toEqual(['tap-0001', 'tap-0002']);
    expect(await runGiftOperation('qa', first, work, db)).toEqual(result);
    await Promise.all([
      runGiftOperation('qa', batch('batch-002', ['tap-0002', 'tap-0003']), work, db),
      runGiftOperation('qa', batch('batch-003', ['tap-0003', 'tap-0004']), work, db),
    ]);
    expect(work).toHaveBeenCalledTimes(4);
    expect((await pg.query('SELECT coins FROM wallet')).rows[0].coins).toBe(640);
    await expect(runGiftOperation('qa', batch('batch-004', ['tap-0001'], { giftId: 'AST-other' }), work, db)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(runGiftOperation('qa', batch('batch-001', ['tap-0002']), work, db)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await pg.exec('UPDATE wallet SET coins=100'); // isolated fixture only
    await expect(runGiftOperation('qa', batch('batch-005', ['tap-0004', 'tap-0005', 'tap-0006']), work, db)).rejects.toThrow('INSUFFICIENT_COINS');
    expect((await pg.query('SELECT coins FROM wallet')).rows[0].coins).toBe(100);
    expect((await pg.query('SELECT count(*)::int AS n FROM effects')).rows[0].n).toBe(4);
    expect((await pg.query("SELECT count(*)::int AS n FROM requests WHERE key IN ('tap-0005','tap-0006','batch-005')")).rows[0].n).toBe(0);
    const failedPoolWrite = batch('batch-006', ['tap-0005']);
    failedPoolWrite.finalize = async () => { throw Error('pool write failed'); };
    await expect(runGiftOperation('qa', failedPoolWrite, work, db)).rejects.toThrow('pool write failed');
    expect((await pg.query('SELECT coins FROM wallet')).rows[0].coins).toBe(100);
    expect((await pg.query('SELECT count(*)::int AS n FROM effects')).rows[0].n).toBe(4);
  } finally { await pg.close(); }
});

it('keeps sequential per-recipient draws with one pool read/write per transaction', async () => {
  const tx = { $queryRaw: vi.fn(async () => [{ id: 'GLOBAL', balance: 100n }]), luckyGiftPool: { update: vi.fn() } };
  const policy = { multipliers: [{ multiplierBps: 10000, weight: 1 }], bigWinMinCoins: 1n };
  const session = {};
  const a = await settleLuckyRewards(tx, [{ gross: 100n, contribution: 60n }], policy, () => 0, session);
  const b = await settleLuckyRewards(tx, [{ gross: 100n, contribution: 60n }, { gross: 100n, contribution: 60n }], policy, () => 0, session);
  expect([...a, ...b].map(r => r.rewardCoins)).toEqual([100n, 100n, 0n]);
  expect(tx.$queryRaw).toHaveBeenCalledOnce();
  expect(tx.luckyGiftPool.update).not.toHaveBeenCalled();
  await flushLuckyPoolSession(tx, session);
  expect(tx.luckyGiftPool.update).toHaveBeenCalledExactlyOnceWith({ where: { id: 'GLOBAL' }, data: { balance: 80n, collected: { increment: 180n }, paidOut: { increment: 200n } } });
});
