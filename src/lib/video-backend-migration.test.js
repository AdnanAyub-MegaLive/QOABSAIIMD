import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("adds moderation and co-host schema without changing existing live sessions", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "User" (id TEXT PRIMARY KEY);
      CREATE TABLE "VideoLiveSession" (id TEXT PRIMARY KEY, status TEXT NOT NULL);
      INSERT INTO "User" VALUES ('host');
      INSERT INTO "VideoLiveSession" VALUES ('live', 'LIVE');`);
    for (const migration of ["20261127120000_video_live_moderation", "20261127140000_video_cohost_pk"]) {
      await db.exec(readFileSync(new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url), "utf8"));
    }
    expect((await db.query('SELECT * FROM "VideoLiveSession"')).rows).toEqual([
      { id: "live", status: "LIVE", chatLocked: false, seatsLocked: false },
    ]);
    await db.exec(`INSERT INTO "VideoLiveAdmin" ("sessionId", "userId") VALUES ('live','host');
      INSERT INTO "VideoCoHostSession" (id, "ownerLiveId") VALUES ('cohost','live');
      INSERT INTO "VideoCoHostMember" ("coHostId", "liveId") VALUES ('cohost','live');`);
    expect((await db.query('SELECT status, score::text FROM "VideoCoHostMember"')).rows).toEqual([{ status: "INVITED", score: "0" }]);
    await db.exec(`DELETE FROM "VideoLiveSession" WHERE id = 'live'`);
    for (const table of ["VideoCoHostSession", "VideoCoHostMember", "VideoLiveAdmin"]) {
      expect((await db.query(`SELECT COUNT(*)::int AS n FROM "${table}"`)).rows[0].n).toBe(0);
    }
  } finally { await db.close(); }
}, 20000);
