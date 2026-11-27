import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { Prisma } from '@prisma/client';
vi.mock('../prisma.js', () => ({ prisma: {} }));
import { tulasiWagersSql, tulasiWinCandidatesSql, tulasiWinStillValid } from './activity.js';
import { tulasiActivitySchema } from './activity-fixture.js';
import { roomScoreSql } from '../room-rankings.js';
import { gameRewardPool } from '../events/game-reward-pool.js';
let pg;
const now = new Date('2026-11-27T12:00:00Z');
const start = new Date('2026-11-27T00:00:00Z');
const end = new Date('2026-11-28T00:00:00Z');
const since = new Date(now.getTime() - 60000);
const roundStart = now.getTime() - 30000;
const query = async q => (await pg.query(q.text, q.values)).rows;
const db = { $queryRaw: (q, ...values) => query(Array.isArray(q) ? Prisma.sql(q, ...values) : q) };
async function ledger(id, type, coins, changes = {}) {
  const row = { userId: 'player', type, coins, status: 'COMPLETED', referenceId: `tulasi:${id}`,
    direction: type === 'GAME_WAGER' ? 'DEBIT' : 'CREDIT', createdAt: new Date(now.getTime() - 5000),
    metadata: { provider: 'TULASI', gameId: '3343', roomId: 'ROOM-1', gameStartTimestamp: roundStart, gameEndTimestamp: now.getTime() - 3000 }, ...changes };
  await pg.query(`INSERT INTO "WalletTransaction" (id,"userId",type,direction,status,coins,"referenceId",metadata,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id,row.userId,row.type,row.direction,row.status,String(row.coins),row.referenceId,JSON.stringify(row.metadata),row.createdAt]);
}
beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(tulasiActivitySchema + `
    CREATE TABLE "RoomRankingRevision" (id text PRIMARY KEY,revision bigint DEFAULT 1);
    INSERT INTO "RoomRankingRevision" VALUES ('__visibility__',1);
    INSERT INTO "TulasiGame" VALUES (3343,'Greedy Lion');
    CREATE TABLE "User" (id text PRIMARY KEY,status text,"deletedAt" timestamp);
    INSERT INTO "User" VALUES ('player','ACTIVE',NULL),('blocked','ACTIVE',NULL);
    CREATE TABLE "GiftTransaction" (id text,"roomId" text,"createdAt" timestamp,"reversedAt" timestamp,"senderId" text,"recipientUserId" text,"coinValue" bigint);
    CREATE TABLE "GiftSettlement" ("giftTransactionId" text);
    CREATE TABLE "GiftRecoverySnapshot" ("giftId" text,data jsonb);
    CREATE TABLE "AuditLog" ("entityType" text,action text,"entityId" text);
    CREATE TABLE "SharedGameDay" (id text,"gameId" text);
    CREATE TABLE "SharedGameEntry" ("userId" text,"roomId" text,"dayId" text,amount bigint,status text,input jsonb,"settledAt" timestamp);
    INSERT INTO "SharedGameDay" VALUES ('d','pizza');
    INSERT INTO "SharedGameEntry" VALUES ('player','ROOM-1','d',50,'SETTLED','{"currency":"COINS"}','2026-11-27 10:00:00');
  `);
  // Embedded PostgreSQL cannot create concurrent indexes. All other migration
  // statements execute unchanged; production builds these indexes concurrently.
  for (const name of ['20261127180000_tulasi_activity_time_index', '20261127180100_tulasi_activity_round_index', '20261127180200_tulasi_activity']) {
    const migration = readFileSync(new URL(`../../../prisma/migrations/${name}/migration.sql`, import.meta.url),'utf8');
    await pg.exec(migration.replaceAll('CREATE INDEX CONCURRENTLY', 'CREATE INDEX'));
  }
},30000);
afterEach(async () => { await pg.close(); });
it('counts winning AND losing confirmed debits, uses server time, excludes failed/reversed/practice/other-period sources', async () => {
  await ledger('loss','GAME_WAGER',100);
  await ledger('winbet','GAME_WAGER',200);
  await ledger('win','GAME_PAYOUT',1000);
  await ledger('pending','GAME_WAGER',9999,{status:'PENDING'});
  await ledger('reversed','GAME_WAGER',9999,{status:'REVERSED'});
  await ledger('failed','GAME_WAGER',9999,{status:'FAILED'});
  await ledger('other','GAME_WAGER',9999,{metadata:{provider:'OTHER',gameId:'3343'}});
  await ledger('tomorrow','GAME_WAGER',9999,{createdAt:end});
  const wagers = await query(tulasiWagersSql(start,end,'ROOM-1'));
  expect(wagers.map(w => BigInt(w.amount)).sort()).toEqual([100n,200n]);
  expect(await gameRewardPool(db,{start,end})).toBe(350n);
  const scores = await query(roomScoreSql('ROOM-1',{start,end},[]));
  expect(scores.find(s => s.gameId === 'tulasi:3343').score).toBe('300');
  expect(scores.find(s => s.gameId === 'pizza').score).toBe('50');
  expect(await query(roomScoreSql('ROOM-1',{start,end},['player']))).toEqual([]);
  await pg.exec(`UPDATE "User" SET status='INACTIVE' WHERE id='player'`);
  expect(await query(roomScoreSql('ROOM-1',{start,end},[]))).toEqual([]);
});
it('aggregates all selections into one net-profit message and separates users and games', async () => {
  await ledger('a','GAME_WAGER',100);
  await ledger('b','GAME_WAGER',150);
  await ledger('p','GAME_PAYOUT',400);
  await ledger('other-user','GAME_WAGER',9000,{userId:'blocked'});
  await ledger('other-game','GAME_WAGER',9000,{metadata:{provider:'TULASI',gameId:'99',gameStartTimestamp:roundStart,roomId:'ROOM-1'}});
  const rows = await query(tulasiWinCandidatesSql(since,now));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({amount:'150',sourceIds:['a','b','p'],details:{provider:'TULASI',gameName:'Greedy Lion',gameId:'tulasi:3343',wagerCoins:'250',payoutCoins:'400'}});
  const row = {...rows[0],payload:{amount:rows[0].amount,details:rows[0].details}};
  expect(await tulasiWinStillValid(db,row)).toBe(true);
  await ledger('late','GAME_WAGER',200);
  expect(await tulasiWinStillValid(db,row)).toBe(false);
  expect(await query(tulasiWinCandidatesSql(since,now))).toEqual([]);
});
it('never announces unmatched, negative-profit, reversed or cross-room rounds', async () => {
  await ledger('p','GAME_PAYOUT',400);
  expect(await query(tulasiWinCandidatesSql(since,now))).toEqual([]);
  await ledger('a','GAME_WAGER',500);
  expect(await query(tulasiWinCandidatesSql(since,now))).toEqual([]);
  await pg.exec(`UPDATE "WalletTransaction" SET coins=100 WHERE id='a'`);
  expect(await query(tulasiWinCandidatesSql(since,now))).toHaveLength(1);
  await pg.exec(`UPDATE "WalletTransaction" SET status='REVERSED' WHERE id='a'`);
  expect(await query(tulasiWinCandidatesSql(since,now))).toEqual([]);
  await pg.exec(`UPDATE "WalletTransaction" SET status='COMPLETED',metadata=jsonb_set(metadata,'{roomId}','"ROOM-2"') WHERE id='a'`);
  expect(await query(tulasiWinCandidatesSql(since,now))).toEqual([]);
});
it('waits for game end and callback quiet interval; does not replay history or double-count retries', async () => {
  await ledger('a','GAME_WAGER',100);
  await ledger('p','GAME_PAYOUT',400,{createdAt:new Date(now.getTime()-1000)});
  expect(await query(tulasiWinCandidatesSql(since,now))).toEqual([]);
  const later = new Date(now.getTime()+3000);
  const [win] = await query(tulasiWinCandidatesSql(since,later));
  expect(win.amount).toBe('300');
  await expect(ledger('retry','GAME_PAYOUT',400,{referenceId:'tulasi:p'})).rejects.toThrow();
  expect((await query(tulasiWinCandidatesSql(since,later)))[0].id).toBe(win.id);
  expect(await query(tulasiWinCandidatesSql(now,later))).toEqual([]);
  await pg.query(`UPDATE "WalletTransaction" SET metadata=jsonb_set(metadata,'{gameEndTimestamp}',to_jsonb($1::bigint)) WHERE id='a'`,[now.getTime()+10000]);
  expect(await query(tulasiWinCandidatesSql(since,later))).toEqual([]);
});
it('invalidates room cache on insert, reversal and delete, atomically; does not change money or unrelated rooms', async () => {
  await ledger('a','GAME_WAGER',100);
  const revisions=async()=> (await pg.query(`SELECT id,revision::text FROM "RoomRankingRevision" ORDER BY id`)).rows;
  const initial=await revisions();
  expect(initial.find(r=>r.id.startsWith('ROOM-1:')).revision).toBe('1');
  await pg.exec(`BEGIN; UPDATE "WalletTransaction" SET status='REVERSED' WHERE id='a'; ROLLBACK;`);
  expect(await revisions()).toEqual(initial);
  await pg.exec(`UPDATE "WalletTransaction" SET status='REVERSED' WHERE id='a'`);
  expect((await revisions()).find(r=>r.id.startsWith('ROOM-1:')).revision).toBe('2');
  await ledger('not-provider','GAME_WAGER',1,{metadata:{provider:'INTERNAL',roomId:'ROOM-2'}});
  expect((await revisions()).some(r=>r.id.startsWith('ROOM-2:'))).toBe(false);
  expect((await pg.query(`SELECT coins::text FROM "WalletTransaction" WHERE id='a'`)).rows[0].coins).toBe('100');
});
