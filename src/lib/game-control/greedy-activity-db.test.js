import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import pg from 'pg';import dotenv from 'dotenv';import {readFileSync} from 'node:fs';import {randomBytes} from 'node:crypto';
vi.mock('../prisma.js',()=>({prisma:{}}));
vi.mock('./shared-games.js',()=>({requireGameRoom:async()=>({id:'u'})}));
vi.mock('./service.js',()=>({assertGameAccess:async()=>{},GameError:class extends Error{}}));
import {greedyActivity} from './greedy-activity.js';
describe.skipIf(process.env.RUN_GREEDY_DB_TESTS!=='1')('Greedy rolling ranking SQL',()=>{
 let client,db;const now=new Date('2026-11-17T12:00:00Z');
 beforeAll(async()=>{
  const url=dotenv.parse(readFileSync('.env.local')).DATABASE_URL;if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Local DB only');
  client=new pg.Client({connectionString:url});await client.connect();await client.query('BEGIN');
  const schema='test_greedy_'+randomBytes(6).toString('hex');await client.query(`CREATE SCHEMA "${schema}"; SET LOCAL search_path TO "${schema}"`);
  await client.query(`CREATE TABLE "User"(id text,"publicId" text,name text,"deletedAt" timestamp,status text);
  CREATE TABLE "SharedGameDay"(id text,"gameId" text);
  CREATE TABLE "SharedGameEntry"("userId" text,"dayId" text,status text,input jsonb,result jsonb,"resolveAt" timestamp);
  INSERT INTO "User" VALUES ('u','USR-1','Same name',NULL,'ACTIVE'),('v','USR-2','Same name',NULL,'ACTIVE');
  INSERT INTO "SharedGameDay" VALUES ('d','greedy'),('p','pizza');`);
  db={gameDefinition:{findUnique:async()=>({settings:{engine:'greedy'}})},$queryRaw:async q=>(await client.query(q.text,q.values)).rows};
 });
 afterAll(async()=>{if(client){await client.query('ROLLBACK');await client.end();}});
 it('sums gross payouts once, excludes pending, other games, free points and old records',async()=>{
  const add=async(user,day,status,currency,payout,at)=>client.query('INSERT INTO "SharedGameEntry" VALUES ($1,$2,$3,$4,$5,$6)',[user,day,status,JSON.stringify({currency}),JSON.stringify({payout}),at]);
  await add('u','d','SETTLED','COINS',195000,'2026-11-17 10:00');await add('u','d','SETTLED','COINS',0,'2026-11-17 10:01');
  await add('v','d','SETTLED','COINS',195000,'2026-11-16 12:00');
  await add('u','d','PENDING','COINS',999999,'2026-11-17 11:00');await add('u','p','SETTLED','COINS',999999,'2026-11-17 11:00');
  await add('u','d','SETTLED','PLAY_POINTS',999999,'2026-11-17 11:00');await add('u','d','SETTLED','COINS',999999,'2026-11-16 11:59:59');
  const data=await greedyActivity({}, {action:'greedy-ranking',gameId:'greedy'},db,now);
  expect(data.rows).toEqual([{publicId:'USR-1',name:'Same name',payout:'195000'},{publicId:'USR-2',name:'Same name',payout:'195000'}]);
 });
 it('history is scoped to the caller, game and rolling window and paginated',async()=>{
  const findMany=vi.fn(async()=>[]);db.sharedGameEntry={findMany};
  await greedyActivity({userId:'u'},{action:'greedy-history',gameId:'greedy',page:2},db,now);
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({where:{userId:'u',day:{gameId:'greedy'},createdAt:{gte:new Date(+now-86400000),lte:now}},skip:100,take:51}));
 });
});
