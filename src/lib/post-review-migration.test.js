import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
it("keeps existing posts approved and defaults new posts to pending", async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "Post" (id TEXT PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO "Post" (id) VALUES (\'existing\');');
    await db.exec(readFileSync(new URL("../../prisma/migrations/20261031190000_discover_post_review/migration.sql", import.meta.url), "utf8"));
    await db.exec('INSERT INTO "Post" (id) VALUES (\'new\');');
    const { rows } = await db.query('SELECT id,status,"reviewRevision" FROM "Post" ORDER BY id');
    expect(rows).toEqual([{ id: "existing", status: "APPROVED", reviewRevision: 0 }, { id: "new", status: "PENDING", reviewRevision: 0 }]);
  } finally { await db.close(); }
});
