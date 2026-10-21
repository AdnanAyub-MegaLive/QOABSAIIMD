import { config } from "dotenv";
import pg from "pg";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
config({path:".env.local",quiet:true});
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
try {
 await db.query("BEGIN");const schema=`medal_test_${Date.now()}`;
 await db.query(`CREATE SCHEMA "${schema}"`);await db.query(`SET LOCAL search_path TO "${schema}"`);
 await db.query('CREATE TABLE "ProfileCardArtwork" (id TEXT PRIMARY KEY,ranges JSONB,revision INT)');
 const rows=[{track:"SUPPORTER",min:0,max:9,badgeAssetId:"AST-old"},{track:"SUPPORTER",min:10,max:19,badgeAssetId:"AST-unused",top1MedalAssetId:null},{track:"AGENCY",min:0,max:null,badgeAssetId:"AST-agency"}];
 await db.query('INSERT INTO "ProfileCardArtwork" VALUES ($1,$2::jsonb,2)',["GLOBAL",JSON.stringify(rows)]);
 const sql=await readFile("prisma/migrations/20261021020000_supporter_medals/migration.sql","utf8");await db.query(sql);
 const result=(await db.query('SELECT * FROM "ProfileCardArtwork"')).rows[0];
 assert.equal(result.ranges[0].top1MedalAssetId,"AST-old");assert.equal(result.ranges[1].top1MedalAssetId,null);assert.deepEqual(result.ranges[2],rows[2]);assert.equal(result.revision,3);
 await db.query(sql);assert.equal((await db.query('SELECT revision FROM "ProfileCardArtwork"')).rows[0].revision,3);
 console.log("Legacy medal preservation, explicit nulls, Agency preservation and migration idempotence verified; isolated schema rolled back.");
}finally{await db.query("ROLLBACK");await db.end();}
