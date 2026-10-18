import 'dotenv/config';
import { config } from 'dotenv';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
config({path:'.env.local',quiet:true});
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
await db.connect();
try {
 await db.query('BEGIN');
 // A rollback-only isolated schema: never reads or changes application rows.
 const schema=`company_bd_test_${Date.now()}`;
 await db.query(`CREATE SCHEMA "${schema}"`);
 await db.query(`SET LOCAL search_path TO "${schema}", public`);
 await db.query(`CREATE TYPE "ApplicationRole" AS ENUM ('BD','LISTENER');
 CREATE TABLE "User" (id text PRIMARY KEY,"publicId" text UNIQUE,name text,country text,"appRoles" "ApplicationRole"[],"isOfficial" boolean,"updatedAt" timestamp,"supervisorUserId" text,"teamRole" text,status text DEFAULT 'ACTIVE',"deletedAt" timestamp,"passwordHash" text,"googleSubject" text,phone text,email text);
 CREATE TABLE "Agency" (id text PRIMARY KEY,"publicId" text,country text,"bdUserId" text);
 CREATE TABLE "AuditLog" (id text,action text,category text,"entityType" text,"entityId" text,description text,metadata jsonb);`);
 await db.query(await readFile('prisma/migrations/20261019010000_company_bd/migration.sql','utf8'));
 assert.equal(Number((await db.query('SELECT count(*) FROM "User"')).rows[0].count),249);
 await db.query(`INSERT INTO "User" (id,"publicId","appRoles","supervisorUserId") VALUES ('test-bd','TEST-BD',ARRAY['BD']::"ApplicationRole"[],'test-manager'); INSERT INTO "Agency" VALUES ('test-agency','TEST-AGENCY','PK','test-bd')`);
 await db.query(`UPDATE "User" SET "supervisorUserId"=NULL WHERE id='test-bd'`);
 assert.equal((await db.query('SELECT "bdUserId" FROM "Agency"')).rows[0].bdUserId,'company-bd-pk');
 assert.equal((await db.query('SELECT count(*) FROM "AuditLog"')).rows[0].count,'1');
 for(const sql of [`UPDATE "User" SET "supervisorUserId"='manager' WHERE id='company-bd-pk'`,`DELETE FROM "User" WHERE id='company-bd-pk'`,`UPDATE "User" SET "passwordHash"='test' WHERE id='company-bd-pk'`]){
  await db.query('SAVEPOINT guard');
  await assert.rejects(db.query(sql));
  await db.query('ROLLBACK TO SAVEPOINT guard');
 }
 console.log('Company BD migration: country provisioning, atomic fallback, audit and protections passed. All test changes rolled back.');
} finally {await db.query('ROLLBACK');await db.end();}
