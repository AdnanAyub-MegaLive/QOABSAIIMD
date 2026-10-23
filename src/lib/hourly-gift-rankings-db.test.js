import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";
vi.mock("./prisma.js", () => ({ prisma: {} }));
vi.mock("./user-perks.js", () => ({ resolveUserPerks: async () => new Map() }));
vi.mock("./decoration-media.js", () => ({ perkMediaFields: () => ({}) }));
import { hourlyGiftScoreSql } from "./hourly-gift-rankings.js";
import { giftHours } from "./hourly-gift-ranking-contract.js";

describe.skipIf(process.env.RUN_HOURLY_RANKING_DB_TESTS !== "1")("isolated hourly SQL and invalidation", () => {
  let db;
  beforeAll(async () => {
    const env = dotenv.parse(readFileSync(".env.local"));
    const url = process.env.HOURLY_RANKING_TEST_DATABASE_URL || env.DATABASE_URL;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) throw new Error("Tests refuse remote databases.");
    db = new pg.Client({ connectionString: url }); await db.connect(); await db.query("BEGIN");
    const schema = `test_hourly_gifts_${randomBytes(8).toString("hex")}`;
    await db.query(`CREATE SCHEMA "${schema}"`); await db.query(`SET LOCAL search_path TO "${schema}"`);
    // Intentionally not UTC: parameter handling must still use UTC clock hours.
    await db.query("SET LOCAL TIME ZONE 'Asia/Karachi'");
    await db.query(`CREATE TABLE "RoomRankingRevision"(id text PRIMARY KEY, revision bigint NOT NULL DEFAULT 1);
      INSERT INTO "RoomRankingRevision" VALUES ('existing-room',77);
      CREATE TABLE "GiftTransaction"(id text PRIMARY KEY,"senderId" text,"recipientUserId" text,"roomId" text,"coinValue" bigint,"createdAt" timestamp,"reversedAt" timestamp);
      CREATE TABLE "GiftSettlement"("giftTransactionId" text PRIMARY KEY);
      CREATE TABLE "GiftRecoverySnapshot"("giftId" text PRIMARY KEY,data jsonb);
      CREATE TABLE "AuditLog"(action text,"entityType" text,"entityId" text);
      INSERT INTO "GiftTransaction" VALUES ('historical','s','r',NULL,100,'2020-01-01',NULL);`);
    await db.query(readFileSync("prisma/migrations/20261023140000_hourly_gift_rankings/migration.sql", "utf8"));
  }, 15000);
  afterAll(async () => { if (db) { await db.query("ROLLBACK"); await db.end(); } });
  const allRows = async (date = "2026-10-23T17:30:00Z") => { const q = hourlyGiftScoreSql(giftHours(new Date(date))); return (await db.query(q.text,q.values)).rows; };
  const totals = async date => (await allRows(date)).filter(r => r.kind === "SCORE").map(({ period, userId, score }) => ({ period, userId, score }));
  const revision = async () => (await db.query(`SELECT SUM(revision)::text AS n FROM "RoomRankingRevision" WHERE id LIKE '__hourly_gifts__%'`)).rows[0].n;
  it("aggregates normal/lucky/combo shares across rooms and null-room surfaces without double count", async () => {
    await db.query(`INSERT INTO "GiftTransaction" VALUES
      ('normal','s','r','room1',100,'2026-10-23 17:01',NULL),
      ('lucky','s','r','room2',200,'2026-10-23 17:02',NULL),
      ('direct','s','r',NULL,300,'2026-10-23 17:03',NULL),
      ('multi1','s','r1','room3',400,'2026-10-23 17:04',NULL),
      ('multi2','s','r2','room3',400,'2026-10-23 17:04',NULL),
      ('self','s','s','room1',100,'2026-10-23 17:05',NULL),
      ('pending','s','r',NULL,999,'2026-10-23 17:06',NULL);
      INSERT INTO "GiftTransaction" SELECT 'combo'||i,'s','r','room1',10,'2026-10-23 17:10'::timestamp,NULL FROM generate_series(1,20) i;
      INSERT INTO "GiftSettlement" SELECT id FROM "GiftTransaction" WHERE id NOT IN ('pending','historical');
      INSERT INTO "GiftRecoverySnapshot" SELECT id,'{"source":"COINS"}'::jsonb FROM "GiftTransaction" WHERE id NOT IN ('pending','historical');
      INSERT INTO "GiftTransaction" VALUES ('multi1','s','r1','room3',400,'2026-10-23 17:04',NULL) ON CONFLICT DO NOTHING;`);
    expect(await totals()).toEqual([{ period: "current", userId: "s", score: "1700" }]);
  });
  it("excludes free/inventory and reversed gifts, never infers spending from current prices", async () => {
    await db.query(`INSERT INTO "GiftTransaction" VALUES
      ('bag','s','r',NULL,900,'2026-10-23 17:07',NULL), ('free','s','r',NULL,900,'2026-10-23 17:07',NULL);
      INSERT INTO "GiftSettlement" VALUES ('bag'),('free');
      INSERT INTO "AuditLog" VALUES ('BACKPACK_GIFT_SENT','GiftTransaction','bag');
      INSERT INTO "GiftRecoverySnapshot" VALUES ('free','{"source":"FREE"}');
      UPDATE "GiftTransaction" SET "reversedAt"='2026-10-23 18:05' WHERE id='normal';`);
    expect((await totals())[0].score).toBe("1600");
  });
  it("boundaries are start-inclusive/end-exclusive and previous Top 3 source rolls over together", async () => {
    await db.query(`INSERT INTO "GiftTransaction" VALUES
      ('before','b','r',NULL,1,'2026-10-23 16:59:59.999',NULL),
      ('start','b','r',NULL,2,'2026-10-23 17:00',NULL),
      ('end','b','r',NULL,4,'2026-10-23 18:00',NULL);
      INSERT INTO "GiftSettlement" VALUES ('before'),('start'),('end');`);
    await db.query(`INSERT INTO "GiftRecoverySnapshot" VALUES ('before','{"source":"COINS"}'),('start','{"source":"COINS"}'),('end','{"source":"COINS"}')`);
    expect((await totals()).filter(r=>r.userId==='b').sort((a,b)=>a.period.localeCompare(b.period))).toEqual([{period:'current',userId:'b',score:'2'},{period:'previous',userId:'b',score:'1'}]);
    expect((await totals("2026-10-23T18:00:00Z")).filter(r=>r.userId==='b').sort((a,b)=>a.period.localeCompare(b.period))).toEqual([{period:'current',userId:'b',score:'4'},{period:'previous',userId:'b',score:'2'}]);
  });
  it("a later reversal corrects the original previous hour, not a negative current hour", async () => {
    await db.query(`UPDATE "GiftTransaction" SET "reversedAt"='2026-10-23 18:10' WHERE id='start'`);
    expect((await totals("2026-10-23T18:15:00Z")).filter(r=>r.userId==='b')).toEqual([{period:'current',userId:'b',score:'4'}]);
  });
  it("rollbacks and duplicate inserts have no contribution or invalidation; committed eligibility edits invalidate", async () => {
    const before = await revision();
    await db.query(`SAVEPOINT failed_gift; INSERT INTO "GiftTransaction" VALUES ('failed','s','r',NULL,9999,'2026-10-23 17:15',NULL); ROLLBACK TO SAVEPOINT failed_gift; RELEASE SAVEPOINT failed_gift;
      INSERT INTO "GiftTransaction" VALUES ('multi1','s','r',NULL,400,'2026-10-23 17:04',NULL) ON CONFLICT DO NOTHING;`);
    expect(await revision()).toBe(before);
    await db.query(`DELETE FROM "GiftSettlement" WHERE "giftTransactionId"='lucky'`);
    expect(BigInt(await revision())).toBeGreaterThan(BigInt(before));
    expect((await totals()).find(r=>r.userId==='s').score).toBe("1400");
  });
  it("keeps exact large scores; source history, existing room counters and wallet tables untouched", async () => {
    await db.query(`INSERT INTO "GiftTransaction" VALUES ('large','big','r',NULL,9007199254740993,'2026-10-23 17:20',NULL); INSERT INTO "GiftSettlement" VALUES ('large'); INSERT INTO "GiftRecoverySnapshot" VALUES ('large','{"source":"COINS"}')`);
    expect((await totals()).find(r=>r.userId==='big').score).toBe("9007199254740993");
    expect((await db.query(`SELECT revision FROM "RoomRankingRevision" WHERE id='existing-room'`)).rows[0].revision).toBe("77");
    expect((await db.query(`SELECT "coinValue" FROM "GiftTransaction" WHERE id='historical'`)).rows[0].coinValue).toBe("100");
    expect((await db.query(`SELECT to_regclass('"WalletTransaction"') AS wallet`)).rows[0].wallet).toBeNull();
  });
  it("excludes unverified historical spending and exposes a coverage flag rather than guessing", async () => {
    await db.query(`INSERT INTO "GiftTransaction" VALUES ('unknown','unknown','r',NULL,5000,'2026-10-23 17:21',NULL); INSERT INTO "GiftSettlement" VALUES ('unknown')`);
    expect((await totals()).some(r => r.userId === 'unknown')).toBe(false);
    expect((await allRows()).find(r => r.kind === 'UNVERIFIED')).toMatchObject({ period: 'current', score: '1' });
  });
});
