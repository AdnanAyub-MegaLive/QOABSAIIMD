import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "@prisma/client";
import { rejectDuplicateArtwork } from "./upload-duplicates";

it("checks existing bytes through PostgreSQL and Prisma without altering the library", async () => {
  const engine = new PGlite();
  const db = new PrismaClient({ adapter: new PrismaPGlite(engine) });
  try {
    await engine.exec(`
      CREATE TABLE "UploadAsset" (id text PRIMARY KEY, "publicId" text, active boolean DEFAULT true,
        category text, "fileData" bytea, "fileSize" int, "fileName" text, distribution text DEFAULT 'MANUAL',
        "storeVisible" boolean DEFAULT false, "audioRoomId" text, "archivedAt" timestamp, "createdAt" timestamp DEFAULT now());
      CREATE TABLE "LevelTagBackground" ("assetId" text);
      INSERT INTO "UploadAsset" (id,"publicId",category,"fileData","fileSize","fileName")
        VALUES ('one','AST-ONE','FRAMES',decode('616263','hex'),3,'original.png');
    `);
    await expect(db.$transaction(tx => rejectDuplicateArtwork(tx, { category: "FRAMES", bytes: Buffer.from("abc") }))).rejects.toMatchObject({ code: "DUPLICATE_ARTWORK", assetId: "AST-ONE" });
    await db.$transaction(tx => rejectDuplicateArtwork(tx, { category: "FRAMES", bytes: Buffer.from("abd") }));
    await db.$transaction(tx => rejectDuplicateArtwork(tx, { category: "BADGES", bytes: Buffer.from("abc") }));
    await engine.exec(`UPDATE "UploadAsset" SET "archivedAt" = now()`);
    await db.$transaction(tx => rejectDuplicateArtwork(tx, { category: "FRAMES", bytes: Buffer.from("abc") }));
    expect((await engine.query('SELECT count(*)::int AS count FROM "UploadAsset"')).rows[0].count).toBe(1);
  } finally {
    await db.$disconnect();
    await engine.close();
  }
}, 20000);
