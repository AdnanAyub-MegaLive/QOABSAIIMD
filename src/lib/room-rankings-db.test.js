// Opt-in LOCAL PostgreSQL tests. All fixtures/DDL live in a random schema within
// one rolled-back transaction; never reads or writes application tables.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";
vi.mock("./prisma.js", () => ({ prisma: {} }));
vi.mock("./user-perks.js", () => ({ resolveUserPerks: async () => new Map() }));
vi.mock("./decoration-media.js", () => ({ decorationMedia: () => ({}), perkMediaFields: () => ({}) }));
import { roomScoreSql } from "./room-rankings.js";
import { roomRankingPeriod } from "./room-ranking-contract.js";

describe.skipIf(process.env.RUN_ROOM_RANKING_DB_TESTS !== "1")("isolated PostgreSQL ranking SQL and migration", () => {
  let client;
  beforeAll(async () => {
    const env = dotenv.parse(readFileSync(".env.local"));
    const url = process.env.ROOM_RANKING_TEST_DATABASE_URL || env.DATABASE_URL;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) throw new Error("These tests refuse non-local databases.");
    client = new pg.Client({ connectionString: url }); await client.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const schema = `test_room_rankings_${randomBytes(8).toString("hex")}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE "User" (id text PRIMARY KEY, status text DEFAULT 'ACTIVE', "deletedAt" timestamp);
      CREATE TABLE "UserBlock" ("blockerId" text, "blockedId" text);
      CREATE TABLE "Ban" (id text);
      CREATE TABLE "GiftTransaction" (id text PRIMARY KEY, "senderId" text, "recipientUserId" text, "coinValue" bigint, "roomId" text, "createdAt" timestamp, "reversedAt" timestamp);
      CREATE TABLE "GiftSettlement" ("giftTransactionId" text PRIMARY KEY);
      CREATE TABLE "GiftRecoverySnapshot" ("giftId" text PRIMARY KEY, data jsonb);
      CREATE TABLE "AuditLog" (action text, "entityType" text, "entityId" text);
      CREATE TABLE "SharedGameDay" (id text PRIMARY KEY, "gameId" text);
      CREATE TABLE "SharedGameEntry" (id text PRIMARY KEY, "dayId" text, "roomId" text, "userId" text, amount bigint, input jsonb, status text, "resolveAt" timestamp);
      INSERT INTO "SharedGameEntry" VALUES ('legacy','d','r','s',900,'{"currency":"COINS"}','SETTLED',now());
    `);
    await client.query(readFileSync("prisma/migrations/20261023130000_room_rankings/migration.sql", "utf8"));
    await client.query(`INSERT INTO "User"(id) VALUES ('s'), ('r1'), ('r2'), ('hidden'); INSERT INTO "SharedGameDay" VALUES ('d','pizza')`);
  }, 15000);
  afterAll(async () => { if (client) { await client.query("ROLLBACK"); await client.end(); } });
  const totals = async (hidden = []) => {
    const q = roomScoreSql("r", roomRankingPeriod("DAILY"), hidden);
    return (await client.query(q.text, q.values)).rows;
  };
  it("normal, lucky, multi shares and rapid combo counted once; no batch parent or reward ledger", async () => {
    await client.query(`INSERT INTO "GiftTransaction" SELECT 'g'||n,'s',CASE WHEN n%2=0 THEN 'r2' ELSE 'r1' END,100,'r',now(),NULL FROM generate_series(1,22) n;
      INSERT INTO "GiftSettlement" SELECT id FROM "GiftTransaction";
      INSERT INTO "GiftTransaction" VALUES ('pending','s','r1',900,'r',now(),NULL), ('other','s','r1',900,'other',now(),NULL);
      INSERT INTO "GiftSettlement" VALUES ('other');
      INSERT INTO "GiftTransaction" VALUES ('g1','s','r1',100,'r',now(),NULL) ON CONFLICT DO NOTHING;`);
    const result = await totals();
    expect(result.find(r => r.category === "WEALTH").score).toBe("2200");
    expect(result.filter(r => r.category === "CHARM").map(r => r.score).sort()).toEqual(["1100", "1100"]);
  });
  it("full reversal corrects original contribution; inventory does not count as spending", async () => {
    await client.query(`UPDATE "GiftTransaction" SET "reversedAt"=now() WHERE id='g1';
      INSERT INTO "GiftTransaction" VALUES ('bag','s','r1',50,'r',now(),NULL);
      INSERT INTO "GiftSettlement" VALUES ('bag');
      INSERT INTO "AuditLog" VALUES ('BACKPACK_GIFT_SENT','GiftTransaction','bag');`);
    const result = await totals();
    expect(result.find(r => r.category === "WEALTH").score).toBe("2100");
    expect(result.filter(r => r.category === "CHARM").reduce((s,r) => s+BigInt(r.score),0n)).toBe(2150n);
  });
  it("excludes deleted/banned-status/blocked identities", async () => {
    await client.query(`UPDATE "User" SET "deletedAt"=now() WHERE id='r2'`);
    expect((await totals(["r1"])).filter(r => r.category === "CHARM")).toEqual([]);
    await client.query(`UPDATE "User" SET status='BANNED' WHERE id='s'`);
    expect((await totals()).filter(r => r.category === "WEALTH")).toEqual([]);
    await client.query(`UPDATE "User" SET status='ACTIVE',"deletedAt"=NULL`);
  });
  it("records real settlement only on transition, excludes old/failed/refunded/free-point activity", async () => {
    expect((await client.query(`SELECT "settledAt" FROM "SharedGameEntry" WHERE id='legacy'`)).rows[0].settledAt).toBeNull();
    await client.query(`INSERT INTO "SharedGameEntry"(id,"dayId","roomId","userId",amount,input,status,"resolveAt") VALUES
      ('new','d','r','s',500,'{"currency":"COINS"}','PENDING','2000-01-01'),
      ('free','d','r','s',500,'{"currency":"PLAY_POINTS"}','SETTLED',now()),
      ('cancel','d','r','s',500,'{"currency":"COINS"}','CANCELLED',now()),
      ('missing','d',NULL,'s',500,'{"currency":"COINS"}','SETTLED',now());
      UPDATE "SharedGameEntry" SET status='SETTLED' WHERE id='new'`);
    const at = (await client.query(`SELECT "settledAt" FROM "SharedGameEntry" WHERE id='new'`)).rows[0].settledAt;
    expect(at.getUTCFullYear()).toBe(new Date().getUTCFullYear());
    await client.query(`UPDATE "SharedGameEntry" SET status='SETTLED' WHERE id='new'`);
    expect((await client.query(`SELECT "settledAt" FROM "SharedGameEntry" WHERE id='new'`)).rows[0].settledAt).toEqual(at);
    expect((await totals()).find(r => r.category === "GAMES").score).toBe("500");
    await client.query(`UPDATE "SharedGameEntry" SET status='REFUNDED' WHERE id='new'`);
    expect((await totals()).filter(r => r.category === "GAMES")).toEqual([]);
  });
  it("start inclusive / end exclusive and bounded room range", async () => {
    await client.query(`INSERT INTO "GiftTransaction" VALUES
      ('start','s','r1',1,'boundary','2026-10-23',NULL),
      ('before','s','r1',10,'boundary','2026-10-22 23:59:59.999',NULL),
      ('end','s','r1',100,'boundary','2026-10-24',NULL);
      INSERT INTO "GiftSettlement" VALUES ('start'),('before'),('end');`);
    const q = roomScoreSql("boundary", roomRankingPeriod("DAILY", new Date("2026-10-23T12:00:00Z")), []);
    expect((await client.query(q.text,q.values)).rows.map(r=>r.score)).toEqual(["1","1"]);
  });
  it("rollback does not invalidate, committed source edits do; no wallet tables exist", async () => {
    const revision = async () => (await client.query(`SELECT SUM(revision)::text AS revision FROM "RoomRankingRevision" WHERE id LIKE 'r:%'`)).rows[0].revision;
    const before = await revision();
    await client.query(`SAVEPOINT retry; UPDATE "GiftTransaction" SET "reversedAt"=now() WHERE id='g2'; ROLLBACK TO SAVEPOINT retry; RELEASE SAVEPOINT retry`);
    expect(await revision()).toBe(before);
    await client.query(`UPDATE "GiftTransaction" SET "reversedAt"=now() WHERE id='g2'`);
    expect(BigInt(await revision())).toBeGreaterThan(BigInt(before));
    expect((await client.query(`SELECT to_regclass('"WalletTransaction"') AS wallet`)).rows[0].wallet).toBeNull();
  });
});
