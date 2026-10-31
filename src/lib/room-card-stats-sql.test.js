import { PGlite } from "@electric-sql/pglite";
import { it, expect, vi } from "vitest";
vi.mock("./prisma.js", () => ({ prisma: {} }));
import { roomCardStats } from "./room-card-stats.js";
it("includes committed pending deltas without double counting folded deltas", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE "RoomGiftTotal" ("roomId" TEXT, coins BIGINT);
      CREATE TABLE "RoomGiftDelta" ("roomId" TEXT, coins BIGINT, "processedAt" TIMESTAMP);
      INSERT INTO "RoomGiftTotal" VALUES ('R1',100);
      INSERT INTO "RoomGiftDelta" VALUES ('R1',20,NULL),('R1',100,CURRENT_TIMESTAMP),('OTHER',50,NULL);`);
    const db = { $queryRaw: async sql => (await pg.query(sql.text, sql.values)).rows, redEnvelope: { groupBy: async () => [] } };
    const result = await roomCardStats([{ id: "room", roomId: "R1" }], db);
    expect(result.get("R1").giftTotalCoins).toBe("120");
  } finally { await pg.close(); }
});
