import dotenv from 'dotenv';
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
dotenv.config({path:'.env.local',quiet:true});
const url=new URL(process.env.DATABASE_URL);
if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.includes('local')) throw new Error('Local test database required');
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
const schema=`ranking_guard_test_${Date.now()}`;
try {
 await db.connect();await db.query('BEGIN');
 await db.query(`CREATE SCHEMA ${schema}; SET LOCAL search_path=${schema},pg_temp`);
 await db.query(`CREATE TABLE "RoomRankingRevision" (id text PRIMARY KEY, revision bigint DEFAULT 1, "createdAt" timestamp DEFAULT now());
 CREATE TABLE _prisma_migrations (migration_name text, finished_at timestamptz, rolled_back_at timestamptz);
 INSERT INTO _prisma_migrations VALUES ('20261023130000_room_rankings','2026-10-23T12:27:52Z',null),('20261023140000_hourly_gift_rankings','2026-10-23T12:51:20Z',null);
 CREATE FUNCTION noop() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;`);
 const triggers={GiftTransaction:['room_ranking_gift','hourly_gift_ranking_gifts'],SharedGameEntry:['room_ranking_settlement','room_ranking_game'],User:['room_ranking_user_visibility'],UserBlock:['room_ranking_blocks'],Ban:['room_ranking_bans'],GiftSettlement:['hourly_gift_ranking_settlements'],GiftRecoverySnapshot:['hourly_gift_ranking_recovery'],AuditLog:['hourly_gift_ranking_inventory']};
 for(const [table,names] of Object.entries(triggers)){
  await db.query(`CREATE TABLE "${table}" (id text)`);
  for(const name of names)await db.query(`CREATE TRIGGER ${name} AFTER INSERT ON "${table}" FOR EACH STATEMENT EXECUTE FUNCTION noop()`);
 }
 const sql=await readFile(new URL('../prisma/migrations/20261116103000_protect_ranking_markers/migration.sql',import.meta.url),'utf8');
 await db.query(sql.replace(/^BEGIN;\n/, '').replace(/COMMIT;\s*$/, '').replaceAll('public, pg_temp',`${schema}, pg_temp`));
 const rows=()=>db.query('SELECT * FROM "RoomRankingRevision" ORDER BY id').then(r=>r.rows);
 const initial=await rows();assert.equal(initial.length,3);
 assert.equal((await db.query('SELECT ensure_ranking_markers() AS n')).rows[0].n,0);assert.deepEqual(await rows(),initial);
 await db.query(`INSERT INTO "RoomRankingRevision" (id) VALUES ('room:1'); DELETE FROM "RoomRankingRevision"`);
 const deleted=await rows();assert.equal(deleted.length,3);assert(BigInt(deleted[0].revision)>BigInt(initial[0].revision));assert.equal(+deleted[0].createdAt,+initial[0].createdAt);
 await db.query('TRUNCATE "RoomRankingRevision"');assert.equal((await rows()).length,3);
 await db.query(`ALTER TABLE "GiftTransaction" DISABLE TRIGGER room_ranking_gift`);
 await assert.rejects(()=>db.query('SELECT ensure_ranking_markers()'),/infrastructure is incomplete/);
 console.log('PASS: initial repair, idempotence, timestamp preservation, DELETE/TRUNCATE restoration, cache invalidation, incomplete-infrastructure rejection. All fixtures rolled back.');
}finally{await db.query('ROLLBACK').catch(()=>{});await db.end();}
