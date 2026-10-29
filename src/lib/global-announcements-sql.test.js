import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { it, expect } from "vitest";
import { announcementCandidatesSql } from "./global-announcements.js";

it("isolated PostgreSQL: complete-round net profit, paid gifts, reversals, expiry and durable dedup", async () => {
  const db = new PGlite(); // In memory only. Never opens the configured database.
  try {
    await db.exec(`
      CREATE TABLE "GiftTransaction" (id text PRIMARY KEY, "senderId" text, "roomId" text, "coinValue" bigint, "giftName" text, quantity int, "reversedAt" timestamp);
      CREATE TABLE "GiftRecoverySnapshot" ("giftId" text PRIMARY KEY, data jsonb, "createdAt" timestamp);
      CREATE TABLE "GiftSettlement" ("giftTransactionId" text);
      CREATE TABLE "SharedGameDay" (id text PRIMARY KEY, "gameId" text, settings jsonb);
      CREATE TABLE "SharedGameEntry" (id text PRIMARY KEY, "dayId" text, "roomId" text, slot int, "userId" text, input jsonb, result jsonb, amount bigint, status text, "settledAt" timestamp, "resolveAt" timestamp);
    `);
    await db.exec(readFileSync(new URL("../../prisma/migrations/20261029010000_global_announcements/migration.sql", import.meta.url), "utf8"));
    const now = new Date("2026-10-29T12:00:00Z"), since = new Date("2026-10-29T11:59:00Z");
    await db.exec(`
      INSERT INTO "GiftTransaction" VALUES
        ('gift1','sender','ROOM-1',9007199254740993,'Rose',1,NULL),
        ('gift2','sender','ROOM-1',100,'Rose',1,NULL),
        ('bag','sender','ROOM-1',100,'Rose',1,NULL),
        ('reversed','sender','ROOM-1',100,'Rose',1,'2026-10-29 11:59:59'),
        ('private','sender',NULL,100,'Rose',1,NULL),
        ('old','sender','ROOM-1',100,'Rose',1,NULL);
      INSERT INTO "GiftSettlement" SELECT id FROM "GiftTransaction";
      INSERT INTO "GiftRecoverySnapshot" SELECT id,
        jsonb_build_object('source',CASE WHEN id='bag' THEN 'BACKPACK' ELSE 'COINS' END,'luckyCoins','200'),
        CASE WHEN id='old' THEN timestamp '2026-10-28' ELSE timestamp '2026-10-29 11:59:58' END FROM "GiftTransaction";
      INSERT INTO "SharedGameDay" VALUES ('day','roulette','{"name":"Roulette"}');
      INSERT INTO "SharedGameEntry" VALUES
        ('e1','day','ROOM-1',1,'player','{"currency":"COINS"}','{"payout":"400"}',100,'SETTLED','2026-10-29 11:59:58','2026-10-29 11:59:57'),
        ('e2','day','ROOM-1',1,'player','{"currency":"COINS"}',NULL,150,'PENDING',NULL,'2026-10-29 11:59:57'),
        ('free','day','ROOM-1',2,'free','{"currency":"PLAY_POINTS"}','{"payout":"90000"}',100,'SETTLED','2026-10-29 11:59:58','2026-10-29 11:59:57');
    `);
    const query = announcementCandidatesSql(since, now);
    let rows = (await db.query(query.text, query.values)).rows;
    expect(rows).toHaveLength(4);
    expect(rows.find(r => r.id === "BIG_GIFT:gift1").amount).toBe("9007199254740993");
    await db.exec(`UPDATE "SharedGameEntry" SET status='SETTLED',result='{"payout":"0"}',"settledAt"='2026-10-29 11:59:59' WHERE id='e2';`);
    rows = (await db.query(query.text, query.values)).rows;
    const game = rows.find(r => r.type === "GAME_WIN");
    expect(game.amount).toBe("150");
    expect(game.details).toMatchObject({ payoutCoins: "400", wagerCoins: "250", netProfitCoins: "150" });
    expect(game.sourceIds).toEqual(["e1", "e2"]);
    await db.query(`INSERT INTO "GlobalAnnouncement" (id,"actorId",type,"roomId","sourceIds","expiresAt") VALUES ($1,'player','GAME_WIN','ROOM-1',ARRAY['e1','e2'],$2)`, [game.id, now]);
    rows = (await db.query(query.text, query.values)).rows;
    expect(rows.some(r => r.type === "GAME_WIN")).toBe(false);
    const future = announcementCandidatesSql(now, new Date(now.getTime() + 1000));
    expect((await db.query(future.text, future.values)).rows).toHaveLength(0);
  } finally { await db.close(); }
}, 30000);
