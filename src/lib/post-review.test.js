import { describe, it, expect, vi } from "vitest";
vi.mock("./discover-notifications.js", () => ({ notifyMentions: vi.fn() }));
import { notifyMentions } from "./discover-notifications.js";
import { reviewPost } from "./post-review.js";
function database(count = 1) {
  const tx = { post: { findUnique: vi.fn(async () => ({ id: "p", publicId: "PST-1", authorId: "u", description: "hello", reviewRevision: 0, status: "PENDING" })), updateMany: vi.fn(async () => ({ count })) }, auditLog: { create: vi.fn() }, notification: { upsert: vi.fn() } };
  return { ...tx, $transaction: callback => callback(tx) };
}
describe("Discover post review", () => {
  it("approves with revision guard and records notification in the transaction", async () => {
    const db = database();
    expect(await reviewPost(db, "a", { postId: "PST-1", revision: 0, action: "APPROVE" })).toMatchObject({ status: "APPROVED", reviewRevision: 1 });
    expect(db.post.updateMany.mock.calls[0][0].where).toEqual({ id: "p", status: "PENDING", reviewRevision: 0 });
    expect(db.notification.upsert.mock.calls[0][0].create).toMatchObject({ userId: "u", type: "POST_REVIEW" });
    expect(notifyMentions).toHaveBeenCalled();
  });
  it("rejects with an author-readable reason", async () => {
    const db = database();
    await reviewPost(db, "a", { postId: "PST-1", revision: 0, action: "REJECT", reason: "Please remove personal information." });
    expect(db.post.updateMany.mock.calls[0][0].data).toMatchObject({ status: "REJECTED", reviewReason: "Please remove personal information." });
  });
  it("does not notify or audit a stale review", async () => {
    const db = database(0);
    await expect(reviewPost(db, "a", { postId: "PST-1", revision: 0, action: "APPROVE" })).rejects.toMatchObject({ status: 409 });
    expect(db.notification.upsert).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
  it.each([{ action: "DELETE", revision: 0 }, { action: "REJECT", revision: 0 }, { action: "APPROVE", revision: -1 }])("rejects invalid input %j", async input => {
    await expect(reviewPost(database(), "a", { postId: "PST-1", ...input })).rejects.toMatchObject({ status: 422 });
  });
});
