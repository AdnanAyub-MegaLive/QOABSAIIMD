import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("backfills only hosting evidence and preserves first tenure through role and agency changes",async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE TABLE "User"(id TEXT PRIMARY KEY,"publicId" TEXT,"appRoles" TEXT[] NOT NULL DEFAULT '{}',role TEXT NOT NULL DEFAULT 'LISTENER',"agencyId" TEXT);
   CREATE TABLE "Talent"(id TEXT,"publicId" TEXT);
   CREATE TABLE "GiftTransaction"(id TEXT,"recipientUserId" TEXT,"talentId" TEXT);
   CREATE TABLE "GiftSettlement"("giftTransactionId" TEXT,"recipientType" TEXT,"createdAt" TIMESTAMP);
   CREATE TABLE "AgencyJoinRequest"("userId" TEXT,status TEXT,"reviewedAt" TIMESTAMP,"updatedAt" TIMESTAMP,"createdAt" TIMESTAMP);
   INSERT INTO "User" VALUES ('u','TLN-1','{HOST}','HOST',NULL),('legacy','TLN-2','{HOST}','HOST',NULL),('unknown','USR-3','{HOST}','HOST',NULL),('new','USR-4','{}','LISTENER',NULL);
   INSERT INTO "Talent" VALUES ('t','TLN-2');
   INSERT INTO "GiftTransaction" VALUES ('g','u',NULL),('g2',NULL,'t'),('normal','unknown',NULL),('explicit','u','t');
   INSERT INTO "GiftSettlement" VALUES ('g','HOST','2026-10-10'),('g2','HOST','2026-10-03'),('normal','USER','2026-09-01'),('explicit','HOST','2026-10-05');
   INSERT INTO "AgencyJoinRequest" VALUES ('u','APPROVED','2026-10-02','2026-10-20','2026-09-25'),('unknown','PENDING',NULL,'2026-09-01','2026-09-01');`);
  await db.exec(readFileSync(new URL('../../prisma/migrations/20261030220000_host_since/migration.sql',import.meta.url),'utf8'));
  const since=async id=>(await db.query(`SELECT "hostSince" AT TIME ZONE 'UTC' AS "hostSince" FROM "User" WHERE id=$1`,[id])).rows[0].hostSince;
  expect(new Date(await since('u')).toISOString()).toBe('2026-10-02T00:00:00.000Z');
  expect(new Date(await since('legacy')).toISOString()).toBe('2026-10-03T00:00:00.000Z');
  expect(await since('unknown')).toBeNull();expect(await since('new')).toBeNull();
  await db.exec(`UPDATE "User" SET "appRoles"='{HOST}' WHERE id='new'`);
  const first=await since('new');expect(Math.abs(Date.now()-+new Date(first))).toBeLessThan(5000);
  await db.exec(`UPDATE "User" SET "appRoles"='{}',"hostSince"=NULL WHERE id='new';UPDATE "User" SET "appRoles"='{HOST}',"agencyId"='second' WHERE id='new'`);
  expect(await since('new')).toEqual(first);
  await db.exec(`UPDATE "User" SET "agencyId"='first' WHERE id='unknown'`);
  expect(await since('unknown')).not.toBeNull();
  await db.exec(`INSERT INTO "User" (id,"publicId","appRoles") VALUES ('direct','USR-5','{HOST}')`);
  expect(await since('direct')).not.toBeNull();
  await db.exec(`UPDATE "User" SET "agencyId"='changed' WHERE id='u'`);
  expect(new Date(await since('u')).toISOString()).toBe('2026-10-02T00:00:00.000Z');
 }finally{await db.close();}
},15000);
