import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { claimChatPost } from "./chat-posts.js";

it("counts unique senders transactionally and rolls back failed sends", async () => {
  const db = new PGlite();
  const sql = (parts, values) => parts.reduce((s, p, i) => s + p + (i < values.length ? `$${i + 1}` : ""), "");
  const adapter = pg => ({
    $queryRaw: async (s, ...v) => (await pg.query(sql(s, v), v)).rows,
    conversationParticipant: { findMany: async () => [{ userId: "a" }, { userId: "b" }] },
    post: {
      findFirst: async ({ where }) => (await pg.query('SELECT id FROM "Post" WHERE "publicId" = $1 AND status = $2', [where.publicId, where.status])).rows[0],
      update: async ({ where }) => pg.query('UPDATE "Post" SET "shareCount" = "shareCount" + 1 WHERE id = $1', [where.id]),
    },
    postShare: { createMany: async ({ data }) => ({ count: (await pg.query('INSERT INTO "PostShare" ("postId", "userId") VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING "postId"', [data[0].postId, data[0].userId])).rows.length }) },
  });
  try {
    await db.exec('CREATE TABLE "User" (id text PRIMARY KEY); CREATE TABLE "Post" (id text PRIMARY KEY, "publicId" text, status text); INSERT INTO "User" VALUES (\'a\'),(\'b\'); INSERT INTO "Post" VALUES (\'post\',\'POST-1\',\'APPROVED\');');
    await db.exec(readFileSync('prisma/migrations/20261112150000_chat_post_shares/migration.sql', 'utf8'));
    const share = user => db.transaction(tx => claimChatPost(adapter(tx), { id: "chat", kind: "DIRECT" }, user, "POST-1"));
    await Promise.all([share("a"), share("a"), share("b")]);
    expect((await db.query('SELECT "shareCount" FROM "Post"')).rows).toEqual([{ shareCount: 2 }]);
    await db.exec('DELETE FROM "PostShare" WHERE "userId" = \'b\'; UPDATE "Post" SET "shareCount" = 1');
    await expect(db.transaction(async tx => { await claimChatPost(adapter(tx), { id: "chat", kind: "DIRECT" }, "b", "POST-1"); throw new Error("message insert failed"); })).rejects.toThrow("message insert failed");
    expect((await db.query('SELECT "shareCount" FROM "Post"')).rows).toEqual([{ shareCount: 1 }]);
    expect((await db.query('SELECT "userId" FROM "PostShare"')).rows).toEqual([{ userId: "a" }]);
    await db.exec('DELETE FROM "Post"');
    expect((await db.query('SELECT * FROM "PostShare"')).rows).toEqual([]);
  } finally { await db.close(); }
}, 30000);
