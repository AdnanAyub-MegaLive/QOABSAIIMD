import { notifyAction } from "./action-notifications.js";
import { notifyMentions } from "./discover-notifications.js";

export async function reviewPost(db, adminId, input) {
  const { postId, action, revision } = input;
  const reason = String(input.reason ?? "").trim();
  if (!["APPROVE", "REJECT"].includes(action) || !Number.isInteger(revision) || revision < 0 || typeof postId !== "string" || !postId || reason.length > 500 || (action === "REJECT" && !reason)) {
    throw Object.assign(new Error("Choose an action and provide a rejection reason when rejecting."), { status: 422, code: "VALIDATION_ERROR" });
  }
  return db.$transaction(async tx => {
    const post = await tx.post.findUnique({ where: { publicId: postId }, select: { id: true, publicId: true, authorId: true, description: true, status: true, reviewRevision: true } });
    if (!post) throw Object.assign(new Error("Post not found."), { status: 404, code: "POST_NOT_FOUND" });
    const status = action === "APPROVE" ? "APPROVED" : "REJECTED";
    const updated = await tx.post.updateMany({ where: { id: post.id, status: "PENDING", reviewRevision: revision }, data: { status, reviewReason: status === "REJECTED" ? reason : null, reviewedAt: new Date(), reviewedByAdminId: adminId, reviewRevision: { increment: 1 } } });
    if (!updated.count) throw Object.assign(new Error("This post changed. Refresh before reviewing it."), { status: 409, code: "POST_REVIEW_CONFLICT" });
    await tx.auditLog.create({ data: { adminId, action: `DISCOVER_POST_${status}`, category: "CONTENT_MANAGEMENT", entityType: "Post", entityId: postId, description: `Discover post ${status.toLowerCase()}.`, metadata: { revision, reason } } });
    await notifyAction(tx, { userId: post.authorId, key: `post-review:${postId}:${revision}`, type: "POST_REVIEW", title: status === "APPROVED" ? "Post approved" : "Post not approved", body: status === "APPROVED" ? "Your post is now visible in Discover." : reason, action: { screen: "DISCOVER_POST", postId, status } });
    if (status === "APPROVED") await notifyMentions(tx, { actorId: post.authorId, text: post.description, postId });
    return { id: postId, status, reviewRevision: revision + 1 };
  });
}
