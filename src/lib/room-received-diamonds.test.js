import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {test,expect} from 'vitest';
const migration=name=>readFileSync(new URL(`../../prisma/migrations/${name}/migration.sql`,import.meta.url),'utf8');
test('actual historical credits, configurable host/user credits, reversals, edits, deletes and rollback stay exact',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`CREATE TABLE "User"(id text primary key,"publicId" text,"coinBalance" bigint default 0,"hostSalaryCoinBalance" bigint default 0,"resellerCoinBalance" bigint default 0,"couponBalance" integer default 0);
 CREATE TABLE "GiftTransaction"(id text primary key,"roomId" text,"recipientUserId" text,"coinValue" bigint,"reversedAt" timestamp);
 CREATE TABLE "GiftSettlement"("giftTransactionId" text primary key,"recipientDiamonds" bigint);
 CREATE TABLE "WalletTransaction"(id text primary key,"referenceId" text,"userId" text,type text,direction text,status text,diamonds bigint);
 CREATE TABLE "GiftRecoverySnapshot"(id text); CREATE TABLE "SharedGameEntry"(id text,status text,"settledAt" timestamp); CREATE TABLE "Notification"(id text);
 INSERT INTO "GiftTransaction" VALUES ('legacy','room','host',100,NULL),('ledger','room','user',100,NULL),('reversed','room','host',100,now());
 INSERT INTO "GiftSettlement" VALUES ('legacy',20),('reversed',90);
 INSERT INTO "WalletTransaction" VALUES ('w','ledger','user','GIFT_RECEIVED','CREDIT','COMPLETED',10);`);
 await db.exec(migration('20261030010000_confirmed_realtime'));
 await db.exec(migration('20261116121000_room_received_diamonds'));
 const totals=async()=> (await db.query(`SELECT "userId",coins::text,diamonds::text FROM "RoomRecipientGiftTotal" WHERE "roomId"='room' ORDER BY "userId"`)).rows;
 expect(await totals()).toEqual([{userId:'host',coins:'100',diamonds:'20'},{userId:'user',coins:'100',diamonds:'10'}]);
 expect((await db.query(`SELECT * FROM "ConfirmedRealtimeEvent"`)).rows).toHaveLength(0);
 await db.exec(`BEGIN;
 INSERT INTO "GiftTransaction" VALUES ('new','room','host',100,NULL);
 INSERT INTO "WalletTransaction" VALUES ('new-w','new','host','GIFT_RECEIVED','CREDIT','COMPLETED',20);
 INSERT INTO "GiftSettlement" VALUES ('new',20);
 COMMIT;`);
 await db.exec(`UPDATE "GiftSettlement" SET "recipientDiamonds"=999 WHERE "giftTransactionId"='new';`);
 await db.query(`SELECT portal_fold_room_gift_deltas(NULL)`);
 // The actual completed wallet credit takes precedence over a stale settlement.
 expect((await totals())[0]).toEqual({userId:'host',coins:'200',diamonds:'40'});
 const payload=(await db.query(`SELECT payload FROM "ConfirmedRealtimeEvent" WHERE event='audio-room:gift-totals'`)).rows[0].payload;
 expect(payload.changedRecipientDiamonds).toEqual({host:'40'});
 expect(payload.changedRecipients).toEqual({host:'200'});
 await db.exec(`UPDATE "GiftTransaction" SET "reversedAt"=now() WHERE id='new'; UPDATE "GiftTransaction" SET "reversedAt"=now() WHERE id='new';`);
 await db.query(`SELECT portal_fold_room_gift_deltas(NULL)`);
 expect((await totals())[0].diamonds).toBe('20');
 await db.exec(`BEGIN; UPDATE "GiftSettlement" SET "recipientDiamonds"=999 WHERE "giftTransactionId"='legacy'; ROLLBACK;
 UPDATE "GiftSettlement" SET "recipientDiamonds"=25 WHERE "giftTransactionId"='legacy';`);
 await db.query(`SELECT portal_fold_room_gift_deltas(NULL)`);
 expect((await totals())[0]).toEqual({userId:'host',coins:'100',diamonds:'25'});
 await db.exec(`DELETE FROM "GiftTransaction" WHERE id='legacy'; DELETE FROM "GiftSettlement" WHERE "giftTransactionId"='legacy';
 UPDATE "GiftTransaction" SET "reversedAt"=now() WHERE id='ledger';`);
 await db.query(`SELECT portal_fold_room_gift_deltas(NULL)`);
 expect(await totals()).toEqual([{userId:'host',coins:'0',diamonds:'0'},{userId:'user',coins:'0',diamonds:'0'}]);
 } finally {await db.close();}
},30000);

test('missing historical credits abort the backfill instead of guessing Diamonds',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE TABLE "GiftTransaction"(id text,"roomId" text,"recipientUserId" text,"coinValue" bigint,"reversedAt" timestamp);
   CREATE TABLE "GiftSettlement"("giftTransactionId" text,"recipientDiamonds" bigint);
   CREATE TABLE "WalletTransaction"("referenceId" text,"userId" text,type text,direction text,status text,diamonds bigint);
   INSERT INTO "GiftTransaction" VALUES ('unknown','room','host',100,NULL);`);
  await expect(db.exec(migration('20261116121000_room_received_diamonds'))).rejects.toThrow('ROOM_DIAMOND_HISTORY_REQUIRES_RECONCILIATION');
  await db.exec('ROLLBACK');
  expect((await db.query(`SELECT "coinValue"::text AS coins FROM "GiftTransaction"`)).rows[0].coins).toBe('100');
 } finally {await db.close();}
},30000);
