import { expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
vi.mock('../prisma.js',()=>({prisma:{}}));
vi.mock('../user-perks.js',()=>({resolveUserPerks:async()=>new Map()}));
import { eventRankings } from './ranking-data.js';
it('ranks settled Coin wagers across games and rooms, preserves privacy and freezes correct award recipients',async()=>{
 const pg=new PGlite();
 try {
 await pg.exec(`
 CREATE TABLE "User" (id text PRIMARY KEY,"publicId" text,name text,country text,status text,"deletedAt" timestamp);
 CREATE TABLE "Ban" ("userId" text,target text,"revokedAt" timestamp,"expiresAt" timestamp);
 CREATE TABLE "UserBlock" ("blockerId" text,"blockedId" text);
 CREATE TABLE "Talent" (id text,"publicId" text);
 CREATE TABLE "GiftTransaction" ("recipientUserId" text,"talentId" text,"reversedAt" timestamp,"createdAt" timestamp);
 CREATE TABLE "SharedGameEntry" ("userId" text,amount bigint,input jsonb,status text,"settledAt" timestamp,"roomId" text,"dayId" text,result jsonb);
 INSERT INTO "User" VALUES ('a','USR-A','Alice','PK','ACTIVE',null),('b','USR-B','Bob','PK','ACTIVE',null),('c','USR-C','Banned','PK','ACTIVE',null),('d','USR-D','Inactive','PK','INACTIVE',null);
 INSERT INTO "Ban" VALUES ('c','USER',null,null);
 INSERT INTO "SharedGameEntry" VALUES
 ('a',1000,'{"currency":"COINS"}','SETTLED','2026-11-05 00:00:00','room1','game1','{"payout":0}'),
 ('a',250,'{"currency":"COINS"}','SETTLED','2026-11-05 01:00:00','room2','game2','{"payout":999999}'),
 ('b',900,'{"currency":"COINS"}','SETTLED','2026-11-05 02:00:00','room1','game1',null),
 ('a',99999,'{"currency":"COINS"}','PENDING','2026-11-05 02:00:00','room1','game1',null),
 ('a',99999,'{"currency":"COINS"}','CANCELLED','2026-11-05 02:00:00','room1','game1',null),
 ('a',99999,'{"currency":"PLAY_POINTS"}','SETTLED','2026-11-05 02:00:00','room1','game1',null),
 ('a',99999,'{"currency":"COINS"}','SETTLED','2026-11-06 00:00:00','room1','game1',null),
 ('a',99999,'{"currency":"COINS"}','SETTLED',null,'room1','game1',null),
 ('c',99999,'{"currency":"COINS"}','SETTLED','2026-11-05 02:00:00','room1','game1',null),
 ('d',99999,'{"currency":"COINS"}','SETTLED','2026-11-05 02:00:00','room1','game1',null);
 `);
 const db={$queryRaw:async query=>(await pg.query(query.text,query.values)).rows,user:{findMany:async()=>[]}};
 const input={type:'game',period:'today',window:{start:new Date('2026-11-05'),end:new Date('2026-11-06')},origin:'https://portal.example'};
 expect(await eventRankings({...input,raw:true},db)).toEqual([{id:'USR-A',rank:1,score:'1250',recipients:['a']},{id:'USR-B',rank:2,score:'900',recipients:['b']}]);
 const result=await eventRankings({...input,viewerId:'b'},db);
 expect(result.viewer).toEqual({rank:2,gap:'350'});
 expect(result.entries.map(e=>e.name)).toEqual(['Alice','Bob']);
 expect(result.entries.every(e=>!('id' in e)&&!('score' in e))).toBe(true);
 expect((await eventRankings({...input,viewerId:'a'},db)).viewer).toEqual({rank:1,gap:null});
 await pg.exec(`INSERT INTO "UserBlock" VALUES ('b','a');`);
 expect((await eventRankings({...input,viewerId:'b'},db)).entries.map(e=>e.name)).toEqual(['Bob']);
 // A tie stays deterministic without affecting the global rank or awarding anyone twice.
 await pg.exec(`UPDATE "SharedGameEntry" SET amount=1250 WHERE "userId"='b';`);
 expect((await eventRankings({...input,raw:true},db)).map(e=>e.id)).toEqual(['USR-A','USR-B']);
 } finally { await pg.close(); }
},30000);
