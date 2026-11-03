import { expect,it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { directoryCsv } from './directory-csv.js';

it('applies the additive migration and exports legacy host valuations without double counting mapped identities',async()=>{
 const pg=new PGlite();
 try {
  await pg.exec(await readFile('prisma/migrations/20261102120000_reporting_cycles/migration.sql','utf8'));
  await pg.exec(`CREATE TABLE "User" (id text,"publicId" text);
   CREATE TABLE "Agency" (id text,"publicId" text,name text);
   CREATE TABLE "Talent" (id text,"publicId" text,"displayName" text,country text,status text,"createdAt" timestamp,"agencyId" text);
   CREATE TABLE "GiftTransaction" (id text,"recipientUserId" text,"talentId" text,"reversedAt" timestamp);
   CREATE TABLE "GiftSettlement" ("giftTransactionId" text,"agencyId" text,"recipientDiamonds" bigint,"createdAt" timestamp);
   INSERT INTO "User" VALUES ('u','mapped'); INSERT INTO "Agency" VALUES ('a','AGN-1','Agency');
   INSERT INTO "Talent" VALUES ('t','TLN-1','Legacy','PK','ACTIVE','2026-01-01','a'),('mapped','mapped','Duplicate','PK','ACTIVE','2026-01-01','a');
   INSERT INTO "GiftTransaction" VALUES ('g',null,'t',null),('reversed',null,'t','2026-01-12');
   INSERT INTO "GiftSettlement" VALUES ('g','a',9007199254740993000,'2026-01-10'),('reversed','a',500,'2026-01-11');`);
  const db={user:{findMany:async()=>[]},$queryRaw:async q=>(await pg.query(q.text,q.values)).rows};
  const {stream}=await directoryCsv(db,{kind:'hosts',country:'PK',status:'ACTIVE',from:'2026-01-01',to:'2026-01-31'});
  const csv=await new Response(stream).text();
  expect(csv).toContain('9007199254740993000');expect(csv).toContain('LEGACY_TALENT');expect(csv).not.toContain('Duplicate');
  expect(csv.trim().split('\r\n')).toHaveLength(2);
  expect((await pg.query('SELECT COUNT(*) FROM "ReportingCyclePolicy"')).rows[0].count).toBe(0);
  expect((await pg.query('SELECT COUNT(*) FROM "GiftTransaction"')).rows[0].count).toBe(2);
 } finally {await pg.close();}
},20000);
