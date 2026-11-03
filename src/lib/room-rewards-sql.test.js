import { PGlite } from '@electric-sql/pglite';
import { it, expect, vi } from 'vitest';
vi.mock('./prisma.js',()=>({prisma:{}}));
import { roomRewardSnapshotSql, roomRewardAmount, activateRoomRewards } from './room-rewards.js';
it('counts single, three combo taps and four recipients exactly once from paid proof',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`CREATE TABLE "AudioRoom" ("roomId" text,"ownerId" text);
 CREATE TABLE "GiftTransaction" (id text,"senderId" text,"roomId" text,"coinValue" bigint,"operationKey" text,"createdAt" timestamp,"reversedAt" timestamp,"liveSessionId" text);
 CREATE TABLE "WalletTransaction" ("referenceId" text,"userId" text,type text,direction text,status text,coins bigint);
 INSERT INTO "AudioRoom" VALUES ('room','owner');`);
 const gift=async(id,key,extra={})=>db.query(`INSERT INTO "GiftTransaction" VALUES ($1,$2,'room',1000,$3,$4,$5,$6)`,[id,extra.sender??'sender',key,extra.at??'2026-11-04T12:00:00Z',extra.reversed??null,extra.live??null]);
 const debit=async(key,coins=1000,status='COMPLETED')=>db.query(`INSERT INTO "WalletTransaction" VALUES ($1,'sender','GIFT_SENT','DEBIT',$2,$3)`,[key,status,coins]);
 await gift('single',null); await debit('single');
 for(let i=0;i<3;i++){await gift(`tap-${i}`,`op-${i}`);await debit(`op-${i}`);}
 for(let i=0;i<4;i++)await gift(`multi-${i}`,'multi');
 await debit('multi',4000); await debit('multi',4000); // EXISTS never multiplies a contribution.
 await gift('bag',null); await gift('reversed','refund',{reversed:'2026-11-04T14:00:00Z'});await debit('refund');
 await gift('live','live',{live:'video'});await debit('live');
 await gift('pending','pending');await debit('pending',1000,'PENDING');
 await gift('other','multi',{sender:'someone-else'});
 await gift('next','next',{at:'2026-11-05T00:00:00Z'});await debit('next');
 const q=roomRewardSnapshotSql(new Date('2026-11-04T00:00:00Z'),new Date('2026-11-05T00:00:00Z'));
 const [row]=(await db.query(q.text,q.values)).rows;
 expect(BigInt(row.coins)).toBe(8000n);expect(row.giftIds).toHaveLength(8);expect(roomRewardAmount(BigInt(row.coins),200)).toBe(160n);
 await db.exec(`DELETE FROM "GiftTransaction" WHERE id IN ('multi-2','multi-3')`);
 const [six]=(await db.query(q.text,q.values)).rows;
 expect(BigInt(six.coins)).toBe(6000n);expect(roomRewardAmount(BigInt(six.coins),200)).toBe(120n);
 }finally{await db.close();}
},30000);
it('activation is next UTC midnight and repeat activation preserves the cutoff',async()=>{
 let row; const audit=vi.fn();const tx={roomRewardActivation:{createMany:async({data})=>{if(row)return {count:0};row=data[0];return {count:1};},findUnique:async()=>row},auditLog:{create:audit}};
 const db={$transaction:fn=>fn(tx)};
 expect((await activateRoomRewards('admin',db,new Date('2026-11-03T23:59:59Z'))).startsAt.toISOString()).toBe('2026-11-04T00:00:00.000Z');
 await activateRoomRewards('admin',db,new Date('2026-12-01T00:00:00Z'));expect(row.startsAt.toISOString()).toBe('2026-11-04T00:00:00.000Z');expect(audit).toHaveBeenCalledTimes(1);
});
