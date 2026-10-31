import { it, expect, vi } from "vitest";
import { postFeedPage } from "./post-feed-page.js";
it("continues from a stable cursor after its post is hidden or deleted", async () => {
  const db = { post: { findUnique: vi.fn(async () => null) } };
  const first = await postFeedPage(db, "viewer", null);
  const rows = Array.from({ length: 21 }, (_, index) => ({ publicId: `PST-${100 - index}`, createdAt: new Date("2026-11-01T00:00:00Z") }));
  const cursor = first.result(rows).nextCursor;
  const next = await postFeedPage(db, "viewer", cursor);
  expect(next.after.OR[1]).toEqual({ createdAt: rows[19].createdAt, publicId: { lt: rows[19].publicId } });
  expect(db.post.findUnique).not.toHaveBeenCalled();
});
it("accepts a legacy post ID cursor and seeks beyond a hidden post", async () => {
  const date = new Date();
  const db = { post: { findUnique: vi.fn(async () => ({ publicId: "PST-old", createdAt: date })) } };
  expect((await postFeedPage(db, "viewer", "PST-old")).after.OR[0]).toEqual({ createdAt: { lt: date } });
});
it("recovers a deleted legacy cursor and rejects malformed new cursors", async () => {
  const db = { post: { findUnique: async () => null } };
  expect((await postFeedPage(db, "viewer", "PST-deleted")).after).toEqual({});
  await expect(postFeedPage(db, "viewer", "feed:invalid")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
});
