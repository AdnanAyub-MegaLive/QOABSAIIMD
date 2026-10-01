import { beforeEach, describe, expect, it, vi } from "vitest";
import { addPostComment, commentText, deletePostComment, listPostComments, setPostLike } from "./post-social";
let db, likes, comments, blocked;
beforeEach(() => {
  likes = new Set(); comments = []; blocked = false;
  db = {
    post: { findFirst: vi.fn(async () => ({ id: "post", authorId: "owner" })) },
    userBlock: { findFirst: vi.fn(async () => blocked ? {} : null) },
    postLike: {
      upsert: async ({ create }) => likes.add(create.userId),
      deleteMany: async ({ where }) => likes.delete(where.userId),
      count: async () => likes.size,
    },
    postComment: {
      create: async ({ data }) => { const row = { ...data, id: `comment-${comments.length}`, deletedAt: null, createdAt: new Date(), author: { publicId: "USR-1", name: "Person", profileImage: null } }; comments.push(row); return row; },
      count: async () => comments.filter(c => !c.deletedAt).length,
      findFirst: vi.fn(async ({ where }) => comments.find(c => c.id === where.id && c.postId === where.postId)),
      updateMany: async ({ where, data }) => { const row = comments.find(c => c.id === where.id && !c.deletedAt); if (row) Object.assign(row, data); },
      findMany: vi.fn(async () => comments.filter(c => !c.deletedAt)),
    },
    $transaction: async fn => fn(db),
  };
});
describe("Discover interactions", () => {
  it("likes and unlikes idempotently with database counts", async () => {
    expect(await setPostLike(db, "PST-1", "a", true)).toEqual({ liked: true, likeCount: 1 });
    expect(await setPostLike(db, "PST-1", "a", true)).toEqual({ liked: true, likeCount: 1 });
    expect(await setPostLike(db, "PST-1", "b", true)).toEqual({ liked: true, likeCount: 2 });
    expect(await setPostLike(db, "PST-1", "a", false)).toEqual({ liked: false, likeCount: 1 });
    expect(await setPostLike(db, "PST-1", "a", false)).toEqual({ liked: false, likeCount: 1 });
  });
  it("blocks likes/comments in either direction but permits unliking", async () => {
    blocked = true;
    await expect(setPostLike(db, "PST-1", "a", true)).rejects.toMatchObject({ status: 403 });
    await expect(addPostComment(db, "PST-1", "a", "hello")).rejects.toMatchObject({ status: 403 });
    expect(await setPostLike(db, "PST-1", "a", false)).toMatchObject({ liked: false });
    expect(comments).toHaveLength(0);
  });
  it("trims Unicode comments and rejects invalid inputs", () => {
    expect(commentText("  سلام 🎁  ")).toBe("سلام 🎁");
    expect(commentText("🎁".repeat(500))).toHaveLength(1000);
    for (const value of [null, {}, 12, " ", "x".repeat(501)]) expect(() => commentText(value)).toThrow();
  });
  it.each(["writer", "owner"])("allows %s to delete and excludes soft-deleted comments", async actor => {
    const created = await addPostComment(db, "PST-1", "writer", " hello ");
    expect(created.comment.text).toBe("hello");
    expect(created.commentCount).toBe(1);
    expect(await deletePostComment(db, "PST-1", actor, created.comment.id)).toEqual({ commentCount: 0 });
    expect(await deletePostComment(db, "PST-1", actor, created.comment.id)).toEqual({ commentCount: 0 });
    expect((await listPostComments(db, "PST-1")).comments).toEqual([]);
  });
  it("rejects unrelated deleters and cross-post IDs", async () => {
    await addPostComment(db, "PST-1", "writer", "hello");
    await expect(deletePostComment(db, "PST-1", "other", "comment-0")).rejects.toMatchObject({ status: 403 });
    comments[0].postId = "other-post";
    await expect(deletePostComment(db, "PST-1", "writer", "comment-0")).rejects.toMatchObject({ status: 404 });
    await expect(listPostComments(db, "PST-1", "comment-0")).rejects.toMatchObject({ status: 422 });
  });
  it("uses stable tuple pagination and a 20-comment page", async () => {
    for (let i = 0; i < 21; i++) await addPostComment(db, "PST-1", "writer", "hello");
    const page = await listPostComments(db, "PST-1");
    expect(page.comments).toHaveLength(20);
    expect(page.nextCursor).toBe("comment-19");
    await listPostComments(db, "PST-1", page.nextCursor);
    expect(db.postComment.findMany.mock.calls.at(-1)[0]).toMatchObject({ where: { deletedAt: null, OR: expect.any(Array) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21 });
  });
  it("returns not found for missing posts", async () => {
    db.post.findFirst.mockResolvedValue(null);
    await expect(setPostLike(db, "missing", "a", true)).rejects.toMatchObject({ status: 404 });
  });
});
