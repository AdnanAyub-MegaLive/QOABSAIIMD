import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, test } from 'vitest';

let db;
beforeAll(async () => {
  db = new PGlite(); // Isolated memory database; never reads DATABASE_URL.
  await db.exec(`CREATE TABLE "User" (id text primary key,"publicId" text,"coinBalance" bigint default 0,"hostSalaryCoinBalance" bigint default 0,"resellerCoinBalance" bigint default 0,"couponBalance" integer default 0);
    CREATE TABLE "GiftTransaction" (id text primary key,"roomId" text,"recipientUserId" text,"coinValue" bigint,"reversedAt" timestamp);
    CREATE TABLE "GiftRecoverySnapshot" (id text);
    CREATE TABLE "SharedGameEntry" (id text,status text,"settledAt" timestamp);
    CREATE TABLE "Notification" (id text);
    INSERT INTO "User"(id,"publicId","coinBalance") VALUES ('a','USR-A',9007199254740993),('b','USR-B',0);
    INSERT INTO "GiftTransaction" VALUES ('legacy','room','b',10,NULL);`);
  await db.exec(readFileSync(new URL('../../prisma/migrations/20261030010000_confirmed_realtime/migration.sql', import.meta.url), 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });
test('migration derives history without modifying users or emitting past rewards', async () => {
  expect((await db.query('SELECT "coinBalance"::text AS coins,"walletRevision"::text AS revision FROM "User" WHERE id=\'a\'')).rows[0]).toEqual({coins:'9007199254740993',revision:'0'});
  expect((await db.query('SELECT coins::text FROM "RoomGiftTotal"')).rows[0].coins).toBe('10');
  expect((await db.query('SELECT * FROM "ConfirmedRealtimeEvent"')).rows).toHaveLength(0);
});
test('one final wallet snapshot per user and transaction, exact values and rollback', async () => {
  await db.exec(`BEGIN; UPDATE "User" SET "coinBalance"="coinBalance"-100 WHERE id='a'; UPDATE "User" SET "coinBalance"="coinBalance"+20 WHERE id='a'; UPDATE "User" SET "hostSalaryCoinBalance"=40 WHERE id='b'; COMMIT;`);
  let rows=(await db.query(`SELECT payload FROM "ConfirmedRealtimeEvent" WHERE event='wallet:updated' ORDER BY "userId"`)).rows;
  expect(rows).toHaveLength(2);
  expect(rows[0].payload.walletRevision).toBe('2');
  expect(rows[0].payload.balances.coins).toBe('9007199254740913');
  expect(rows[1].payload.balances.diamonds).toBe('40');
  await db.exec(`BEGIN; UPDATE "User" SET "coinBalance"=0 WHERE id='a'; ROLLBACK; UPDATE "User" SET "coinBalance"="coinBalance" WHERE id='a';`);
  expect((await db.query(`SELECT * FROM "ConfirmedRealtimeEvent" WHERE event='wallet:updated'`)).rows).toHaveLength(2);
});
test('multi-recipient values coalesce, duplicate inserts do not contribute, reversal corrects totals', async () => {
  await db.exec(`BEGIN; INSERT INTO "GiftTransaction" VALUES ('g1','room','a',100,NULL),('g2','room','b',100,NULL); COMMIT;
    INSERT INTO "GiftTransaction" VALUES ('g1','room','a',100,NULL) ON CONFLICT DO NOTHING;`);
  // Financial transaction only appends deltas, never locks the aggregate.
  expect((await db.query(`SELECT coins::text FROM "RoomGiftTotal" WHERE "roomId"='room'`)).rows[0].coins).toBe('10');
  await db.query('SELECT portal_fold_room_gift_deltas(NULL)');
  let events=(await db.query(`SELECT payload FROM "ConfirmedRealtimeEvent" WHERE event='audio-room:gift-totals'`)).rows;
  expect(events).toHaveLength(1);
  expect(events[0].payload.roomTotalCoins).toBe('210');
  expect(events[0].payload.changedRecipients).toEqual({a:'100',b:'110'});
  await db.exec(`UPDATE "GiftTransaction" SET "reversedAt"=now() WHERE id='g1'; UPDATE "GiftTransaction" SET "coinValue"=60 WHERE id='g2';`);
  await db.query('SELECT portal_fold_room_gift_deltas(NULL)');
  expect((await db.query(`SELECT coins::text FROM "RoomGiftTotal" WHERE "roomId"='room'`)).rows[0].coins).toBe('70');
  await db.exec(`BEGIN; INSERT INTO "GiftTransaction" VALUES ('rolled-back','room','a',999,NULL); ROLLBACK;`);
  expect((await db.query(`SELECT coins::text FROM "RoomGiftTotal" WHERE "roomId"='room'`)).rows[0].coins).toBe('70');
});
test('250 committed contributions fold in bounded batches exactly once', async () => {
  for (let i=0;i<250;i++) await db.query(`INSERT INTO "GiftTransaction" VALUES ($1,'burst',$2,50,NULL)`, [`burst-${i}`, i%2?'a':'b']);
  expect((await db.query(`SELECT * FROM "RoomGiftTotal" WHERE "roomId"='burst'`)).rows).toHaveLength(0);
  const counts=[];
  for(let i=0;i<4;i++) counts.push((await db.query(`SELECT portal_fold_room_gift_deltas('burst') AS n`)).rows[0].n);
  expect(counts).toEqual([100,100,50,0]);
  expect((await db.query(`SELECT coins::text,revision::text FROM "RoomGiftTotal" WHERE "roomId"='burst'`)).rows[0]).toEqual({coins:'12500',revision:'3'});
  expect((await db.query(`SELECT coins::text FROM "RoomRecipientGiftTotal" WHERE "roomId"='burst'`)).rows).toEqual([{coins:'6250'},{coins:'6250'}]);
},30000);
