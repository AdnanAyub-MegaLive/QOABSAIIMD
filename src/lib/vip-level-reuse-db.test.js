import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

it("frees archived levels while preserving history and preventing duplicate live levels", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "VipTier" (id text PRIMARY KEY, level int UNIQUE, "archivedAt" timestamp);
      CREATE TABLE purchase ("tierId" text REFERENCES "VipTier"(id) ON DELETE RESTRICT);
      INSERT INTO "VipTier" VALUES ('old-1',1,now()),('old-2',2,now()),('live-3',3,null);
      INSERT INTO purchase VALUES ('old-1');`);
    await db.exec(readFileSync('prisma/migrations/20261123090000_vip_reuse_archived_levels/migration.sql','utf8'));
    await db.exec(`INSERT INTO "VipTier" VALUES ('new-1',1,null),('new-2',2,null)`);
    await expect(db.exec(`INSERT INTO "VipTier" VALUES ('duplicate',1,null)`)).rejects.toMatchObject({code:'23505'});
    await expect(db.exec(`UPDATE "VipTier" SET "archivedAt"=null WHERE id='old-1'`)).rejects.toMatchObject({code:'23505'});
    expect((await db.query('SELECT "tierId" FROM purchase')).rows).toEqual([{tierId:'old-1'}]);
    await db.exec(`UPDATE "VipTier" SET "archivedAt"=now() WHERE id='new-1'; INSERT INTO "VipTier" VALUES ('next-1',1,null)`);
    expect((await db.query('SELECT count(*)::int AS n FROM "VipTier" WHERE "archivedAt" IS NULL')).rows[0].n).toBe(3);
  } finally { await db.close(); }
}, 20000);
