import { PGlite } from "@electric-sql/pglite";
import { it, expect } from "vitest";
import { walletHistorySearch } from "./wallet-history-search.js";
it("searches account-owned rows and counterparties with stable filtered pagination", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE "User" (id TEXT, name TEXT, "publicId" TEXT);
      CREATE TABLE "SpecialIdAssignment" ("userId" TEXT, status TEXT, "revokedAt" TIMESTAMP, "startsAt" TIMESTAMP, "expiresAt" TIMESTAMP, "specialId" TEXT);
      CREATE TABLE "CurrencyRequest" (id TEXT, "userId" TEXT, "recipientPublicId" TEXT);
      CREATE TABLE "WalletTransaction" (id TEXT, "publicId" TEXT, "userId" TEXT, "referenceId" TEXT, title TEXT, description TEXT, type TEXT, status TEXT, coins BIGINT, diamonds BIGINT, "cashAmount" NUMERIC, metadata JSONB, "createdAt" TIMESTAMP);
      INSERT INTO "User" VALUES ('other','Counterparty','USR-other');
      INSERT INTO "SpecialIdAssignment" VALUES ('other','ACTIVE',NULL,'2020-01-01','2099-01-01','GOLD77');
      INSERT INTO "CurrencyRequest" VALUES ('request','me','USR-other');
      INSERT INTO "WalletTransaction" (id,"publicId","userId","referenceId",title,"createdAt") VALUES
        ('1','T1','me','request','First','2026-01-03'),('2','T2','me','request','Second','2026-01-02'),('3','T3','stranger','request','Private','2026-01-01');`);
    await pg.exec(`UPDATE "WalletTransaction" SET coins=100 WHERE id='1'; UPDATE "WalletTransaction" SET diamonds=200 WHERE id='2';`);
    const db = { $queryRaw: async sql => (await pg.query(sql.text, sql.values)).rows };
    const viewer = { id: "me", publicId: "USR-me" };
    expect(await walletHistorySearch(db, "transactions", "GOLD77", viewer, null, 1, null, "DIAMONDS")).toEqual({ id: { in: ["2"] } });
    expect(await walletHistorySearch(db, "transactions", "GOLD77", viewer, null, 1)).toEqual({ id: { in: ["1", "2"] } });
    expect(await walletHistorySearch(db, "transactions", "GOLD77", viewer, "T1", 1)).toEqual({ id: { in: ["2"] } });
    expect(await walletHistorySearch(db, "transactions", "' OR TRUE --", viewer)).toEqual({ id: { in: [] } });
  } finally { await pg.close(); }
});
