import {config} from 'dotenv';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
config({path:'.env.local',quiet:true});
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
await db.connect();
try {
 await db.query('BEGIN');
 const schema=`ownership_test_${Date.now()}`;
 await db.query(`CREATE SCHEMA "${schema}"`);
 await db.query(`SET LOCAL search_path TO "${schema}"`);
 await db.query(`CREATE TYPE "ApplicationRole" AS ENUM ('LISTENER','BD','ADMIN','JUNIOR_ADMIN','SENIOR_ADMIN','SUPER_ADMIN','COUNTRY_HEAD','MANAGER');
 CREATE TABLE "User"(id text PRIMARY KEY,"appRoles" "ApplicationRole"[],"companyBdCountry" text,"supervisorUserId" text,"deletedAt" timestamp);
 CREATE TABLE "Agency"(id text PRIMARY KEY,"ownerUserId" text,"bdUserId" text);
 CREATE UNIQUE INDEX "Agency_ownerUserId_key" ON "Agency"("ownerUserId");`);
 await db.query(await readFile('prisma/migrations/20261019020000_management_multiple_agencies/migration.sql','utf8'));
 await db.query(`CREATE TRIGGER detached_bd_agencies AFTER UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION detached_bd_agencies();
 INSERT INTO "User" (id,"appRoles","companyBdCountry") VALUES ('normal',ARRAY['LISTENER']::"ApplicationRole"[],NULL),('manager',ARRAY['ADMIN']::"ApplicationRole"[],NULL),('company',ARRAY['BD']::"ApplicationRole"[],'PK');
 INSERT INTO "Agency" (id,"ownerUserId") VALUES ('a','normal'),('b','manager'),('c','manager');
 UPDATE "Agency" SET "bdUserId"='manager';
 UPDATE "User" SET "appRoles"=ARRAY['JUNIOR_ADMIN']::"ApplicationRole"[] WHERE id='manager';`);
 assert.equal((await db.query(`SELECT count(*) FROM "Agency" WHERE "bdUserId"='manager'`)).rows[0].count,'3');
 for(const sql of [`INSERT INTO "Agency" (id,"ownerUserId") VALUES ('d','normal')`,`INSERT INTO "Agency" (id,"ownerUserId") VALUES ('e','company')`,`UPDATE "User" SET "appRoles"=ARRAY['LISTENER']::"ApplicationRole"[] WHERE id='manager'`]){
  await db.query('SAVEPOINT guard');await assert.rejects(db.query(sql));await db.query('ROLLBACK TO SAVEPOINT guard');
 }
 assert.equal((await db.query('SELECT count(*) FROM "Agency"')).rows[0].count,'3');
 console.log('Ownership migration guards passed; isolated test schema rolled back.');
}finally{await db.query('ROLLBACK');await db.end();}
