import {config} from 'dotenv';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
config({path:'.env.local',quiet:true});
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
await db.connect();
try{
 await db.query('BEGIN');
 const schema=`prop_gift_test_${Date.now()}`;
 await db.query(`CREATE SCHEMA "${schema}"`);
 await db.query(`SET LOCAL search_path TO "${schema}"`);
 await db.query(`CREATE TYPE "WalletTransactionType" AS ENUM ('STORE_PURCHASE'); CREATE TABLE "UploadAssetAssignment" (id TEXT);`);
 await db.query(await readFile('prisma/migrations/20261019040000_store_prop_gifts/migration.sql','utf8'));
 const enums=await db.query(`SELECT enumlabel FROM pg_enum JOIN pg_type ON enumtypid=pg_type.oid JOIN pg_namespace ON typnamespace=pg_namespace.oid WHERE nspname=$1`,[schema]);
 assert.ok(enums.rows.some(r=>r.enumlabel==='STORE_GIFT_SENT'));assert.ok(enums.rows.some(r=>r.enumlabel==='STORE_GIFT_RECEIVED'));
 const insert=`INSERT INTO "PropGift" (id,"publicId","senderUserId","recipientUserId","recipientPublicId","assetPublicId","requestId",price,result) VALUES ($1,$1,$2,'recipient','USR-R','AST-1','request',40,'{}')`;
 await db.query(insert,['g1','sender']);await db.query('SAVEPOINT duplicate');
 await assert.rejects(db.query(insert,['g2','sender']),e=>e.code==='23505');
 await db.query('ROLLBACK TO SAVEPOINT duplicate');await db.query(insert,['g3','another-sender']);
 console.log('Gift migration enum values and sender-scoped request uniqueness verified; isolated schema rolled back.');
}finally{await db.query('ROLLBACK');await db.end();}
