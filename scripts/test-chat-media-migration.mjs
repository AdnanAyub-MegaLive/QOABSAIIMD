import { config } from "dotenv";
import pg from "pg";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query("BEGIN");
  const schema = `chat_media_test_${Date.now()}`;
  await db.query(`CREATE SCHEMA "${schema}"`);
  await db.query(`SET LOCAL search_path TO "${schema}"`);
  await db.query('CREATE TABLE "Message" (id TEXT PRIMARY KEY, "voiceKey" TEXT)');
  await db.query('INSERT INTO "Message" VALUES ($1,$2),($3,NULL)', ["voice", "private-voice/test.m4a", "text"]);
  await db.query(await readFile("prisma/migrations/20261019050000_chat_media/migration.sql", "utf8"));
  assert.deepEqual((await db.query('SELECT id,kind FROM "Message" ORDER BY id')).rows, [{ id: "text", kind: "text" }, { id: "voice", kind: "voice" }]);
  await db.query('UPDATE "Message" SET "mediaId"=$1 WHERE id=$2', ["upload", "voice"]);
  await db.query("SAVEPOINT duplicate");
  await assert.rejects(db.query('UPDATE "Message" SET "mediaId"=$1 WHERE id=$2', ["upload", "text"]), e => e.code === "23505");
  await db.query("ROLLBACK TO SAVEPOINT duplicate");
  console.log("Chat-media migration and unique attachment consumption verified in an isolated rollback-only schema.");
} finally { await db.query("ROLLBACK"); await db.end(); }
