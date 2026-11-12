import { chatError } from "./chat-media.js";

function approvedForMembers(userIds) {
  return { status: "APPROVED", author: {
    deletedAt: null, status: "ACTIVE",
    blockedUsers: { none: { blockedId: { in: userIds } } },
    blockedByUsers: { none: { blockerId: { in: userIds } } },
  } };
}

export async function claimChatPost(tx, conversation, senderId, postId) {
  if (conversation.kind !== "DIRECT") throw chatError("VALIDATION_ERROR", "Post cards can only be sent in direct chats.");
  const members = await tx.conversationParticipant.findMany({ where: { conversationId: conversation.id }, select: { userId: true } });
  const ids = members.map(m => m.userId);
  if (ids.length !== 2 || !ids.includes(senderId)) throw chatError("CONVERSATION_NOT_FOUND", "Conversation not found.");
  // Serialize shares with moderation/deletion and concurrent share increments.
  await tx.$queryRaw`SELECT id FROM "Post" WHERE "publicId" = ${postId} FOR UPDATE`;
  const post = await tx.post.findFirst({ where: { publicId: postId, ...approvedForMembers(ids) }, select: { id: true } });
  if (!post) throw chatError("POST_NOT_FOUND", "This post is unavailable.");
  const share = await tx.postShare.createMany({ data: [{ postId: post.id, userId: senderId }], skipDuplicates: true });
  if (share.count) await tx.post.update({ where: { id: post.id }, data: { shareCount: { increment: 1 } } });
  return { kind: "post", metadata: { postId } };
}

// Rebuild cards from current data; never persist a description/image snapshot.
// Batch membership and post reads so history/sync do not fetch each card separately.
export async function hydratePostMessages(db, messages, origin) {
  const cards = messages.filter(m => m.kind === "post" && !m.deletedAt && typeof m.metadata?.postId === "string");
  if (!cards.length) return messages;
  const members = await db.conversationParticipant.findMany({ where: { conversationId: { in: [...new Set(cards.map(m => m.conversationId))] } }, select: { conversationId: true, userId: true } });
  const allIds = [...new Set(members.map(m => m.userId))];
  const posts = await db.post.findMany({ where: { publicId: { in: [...new Set(cards.map(m => m.metadata.postId))] }, status: "APPROVED", author: { deletedAt: null, status: "ACTIVE" } }, select: {
    publicId: true, description: true, imageUrl: true,
    _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
    author: { select: { publicId: true, name: true, profileImage: true,
      blockedUsers: { where: { blockedId: { in: allIds } }, select: { blockedId: true } },
      blockedByUsers: { where: { blockerId: { in: allIds } }, select: { blockerId: true } },
    } },
  } });
  const byId = new Map(posts.map(p => [p.publicId, p]));
  return messages.map(message => {
    if (message.kind !== "post" || message.deletedAt) return message;
    const id = message.metadata?.postId, post = byId.get(id);
    const users = members.filter(m => m.conversationId === message.conversationId).map(m => m.userId);
    const blocked = post && new Set([...post.author.blockedUsers.map(b => b.blockedId), ...post.author.blockedByUsers.map(b => b.blockerId)]);
    if (!post || users.length !== 2 || users.some(id => blocked.has(id))) return { ...message, post: { id, available: false } };
    return { ...message, post: {
      id, available: true,
      author: { publicId: post.author.publicId, fullName: post.author.name, profileImage: post.author.profileImage },
      description: [...(post.description || "")].slice(0, 200).join(""),
      imageUrl: post.imageUrl ? (origin ? new URL(post.imageUrl, origin).toString() : post.imageUrl) : null,
      likeCount: post._count.likes, commentCount: post._count.comments,
    } };
  });
}
