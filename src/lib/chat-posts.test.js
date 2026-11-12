import { beforeEach, expect, it, vi } from "vitest";
import { claimChatPost, hydratePostMessages } from "./chat-posts.js";
let db, post;
const message = { kind: "post", conversationId: "chat", metadata: { postId: "POST-1" } };
beforeEach(() => {
  post = { publicId: "POST-1", description: "x".repeat(220), imageUrl: "/api/posts/POST-1/image", author: { publicId: "USR-author", name: "Author", profileImage: null, blockedUsers: [], blockedByUsers: [] }, _count: { likes: 4, comments: 2 } };
  db = { $queryRaw: vi.fn(), conversationParticipant: { findMany: vi.fn(async () => ["sender", "receiver"].map(userId => ({ userId, conversationId: "chat" }))) },
    post: { findFirst: vi.fn(async () => ({ id: "post-db" })), findMany: vi.fn(async () => [post]), update: vi.fn() }, postShare: { createMany: vi.fn(async () => ({ count: 1 })) } };
});
it("checks approval and blocks in both directions for both participants before sharing", async () => {
  expect(await claimChatPost(db, { id: "chat", kind: "DIRECT" }, "sender", "POST-1")).toEqual({ kind: "post", metadata: { postId: "POST-1" } });
  expect(db.post.findFirst.mock.calls[0][0].where).toMatchObject({ status: "APPROVED", author: {
    deletedAt: null, status: "ACTIVE", blockedUsers: { none: { blockedId: { in: ["sender", "receiver"] } } }, blockedByUsers: { none: { blockerId: { in: ["sender", "receiver"] } } },
  } });
  expect(db.$queryRaw.mock.calls[0][0].join("")).toContain("FOR UPDATE");
  expect(db.post.update).toHaveBeenCalledWith({ where: { id: "post-db" }, data: { shareCount: { increment: 1 } } });
});
it("does not count an existing sender/post pair again", async () => {
  db.postShare.createMany.mockResolvedValue({ count: 0 });
  await claimChatPost(db, { id: "chat", kind: "DIRECT" }, "sender", "POST-1");
  expect(db.post.update).not.toHaveBeenCalled();
});
it("refuses unavailable posts and non-DM cards", async () => {
  db.post.findFirst.mockResolvedValue(null);
  await expect(claimChatPost(db, { id: "chat", kind: "DIRECT" }, "sender", "POST-1")).rejects.toMatchObject({ code: "POST_NOT_FOUND" });
  await expect(claimChatPost(db, { id: "chat", kind: "GROUP" }, "sender", "POST-1")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  expect(db.postShare.createMany).not.toHaveBeenCalled();
});
it("hydrates current counters with a 200-character excerpt in a batch", async () => {
  const result = await hydratePostMessages(db, [message, message], "https://portal.test");
  expect(result[0].post).toEqual({ id: "POST-1", available: true, author: { publicId: "USR-author", fullName: "Author", profileImage: null }, description: "x".repeat(200), imageUrl: "https://portal.test/api/posts/POST-1/image", likeCount: 4, commentCount: 2 });
  expect(db.post.findMany).toHaveBeenCalledTimes(1);
  post._count.likes = 9;
  expect((await hydratePostMessages(db, [message]))[0].post.likeCount).toBe(9);
});
it.each(["sender", "receiver"])("hides the card when author blocks or is blocked by %s", async userId => {
  post.author.blockedUsers = [{ blockedId: userId }];
  expect((await hydratePostMessages(db, [message]))[0].post).toEqual({ id: "POST-1", available: false });
  post.author.blockedUsers = []; post.author.blockedByUsers = [{ blockerId: userId }];
  expect((await hydratePostMessages(db, [message]))[0].post).toEqual({ id: "POST-1", available: false });
});
it("returns no author/image/description for removed or moderated posts", async () => {
  db.post.findMany.mockResolvedValue([]);
  expect((await hydratePostMessages(db, [message]))[0].post).toEqual({ id: "POST-1", available: false });
  expect(db.post.findMany.mock.calls[0][0].where.status).toBe("APPROVED");
});
it("does no post queries for ordinary or deleted messages", async () => {
  const records = [{ kind: "text" }, { ...message, deletedAt: new Date() }];
  expect(await hydratePostMessages(db, records)).toBe(records);
  expect(db.post.findMany).not.toHaveBeenCalled();
});
