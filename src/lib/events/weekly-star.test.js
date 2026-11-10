import {expect,it,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
vi.mock('../prisma.js',()=>({prisma:{}}));
vi.mock('../user-perks.js',()=>({resolveUserPerks:async()=>new Map()}));
import {weeklyStarInput} from './weekly-star.js';
import {eventRankings} from './ranking-data.js';
import {rewardInput} from './ranking-reward-rules.js';
it('locks started weeks and validates selected gifts',()=>{
 const now=new Date('2026-11-10');
 expect(weeklyStarInput({week:'2026-11-16',giftIds:['gift']},now).giftIds).toEqual(['gift']);
 for(const week of ['2026-11-09','2026-11-17','2026-02-30','invalid'])expect(()=>weeklyStarInput({week,giftIds:[]},now)).toThrow();
 expect(()=>weeklyStarInput({week:'2026-11-16',giftIds:['a','a']},now)).toThrow();
 expect(()=>rewardInput({track:'weekly-star',period:'today',enabled:false,rewards:[]})).toThrow('weekly periods');
});
it('ranks only senders of selected gifts and excludes refunds and other weeks',async()=>{
 const pg=new PGlite();try{
 await pg.exec(`CREATE TABLE "User"(id text,"publicId" text,name text,country text,status text,"deletedAt" timestamp);
 CREATE TABLE "Ban"("userId" text,target text,"revokedAt" timestamp,"expiresAt" timestamp);
 CREATE TABLE "UserBlock"("blockerId" text,"blockedId" text);
 CREATE TABLE "Talent"(id text,"publicId" text);
 CREATE TABLE "GiftTransaction"("senderId" text,"recipientUserId" text,"talentId" text,"giftAssetId" text,"coinValue" bigint,"reversedAt" timestamp,"createdAt" timestamp);
 INSERT INTO "User" VALUES ('a','A','Alice','PK','ACTIVE',null),('b','B','Bob','PK','ACTIVE',null),('c','C','Receiver','PK','ACTIVE',null);
 INSERT INTO "GiftTransaction" VALUES ('a','c',null,'star',100,null,'2026-11-10'),('b','c',null,'star',40,null,'2026-11-11'),('b','c',null,'ordinary',99999,null,'2026-11-11'),('b','c',null,'star',99999,'2026-11-12','2026-11-11'),('b','c',null,'star',99999,null,'2026-11-16');`);
 const db={$queryRaw:async q=>(await pg.query(q.text,q.values)).rows,weeklyStarWeek:{findUnique:async()=>({giftIds:['star']})},user:{findMany:async()=>[]}};
 const input={type:'weekly-star',period:'week',window:{start:new Date('2026-11-09'),end:new Date('2026-11-16')}};
 expect(await eventRankings({...input,raw:true},db)).toEqual([{id:'A',rank:1,score:'100',recipients:['a']},{id:'B',rank:2,score:'40',recipients:['b']}]);
 const rows=await eventRankings(input,db);expect(rows.entries.map(e=>e.gap)).toEqual([null,'60']);expect(rows.entries.every(e=>!('score' in e))).toBe(true);
 db.weeklyStarWeek.findUnique=async()=>null;
 expect(await eventRankings({...input,raw:true},db)).toEqual([]);
 }finally{await pg.close();}
},30000);
