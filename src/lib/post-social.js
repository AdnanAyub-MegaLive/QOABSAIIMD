import { discoverNotification, notifyMentions } from "./discover-notifications.js";
import { assertChatWordsAllowed } from "./chat-word-policy.js";
const fail = (code, message, status) => { throw Object.assign(new Error(message), { code, status }); };
const authorSelect = { publicId: true, name: true, profileImage: true };
export const commentDto = row => ({ id: row.id, parentCommentId:row.parentId??null, likeCount:row._count?.likes??0, text: row.text, createdAt: row.createdAt.toISOString(), author: { publicId: row.author.publicId, fullName: row.author.name, profileImage: row.author.profileImage } });
export function commentText(value) {
  if (typeof value !== "string" || !value.trim() || [...value.trim()].length > 500)
    fail("VALIDATION_ERROR", "Comment text must contain 1–500 characters.", 422);
  return value.trim();
}
async function requirePost(db, publicId) {
  const post = await db.post.findFirst({ where: { publicId, author: { deletedAt: null, status: "ACTIVE" } }, select: { id: true, authorId: true } });
  if (!post) fail("POST_NOT_FOUND", "Post not found.", 404);
  return post;
}
async function requireUnblocked(db, userId, authorId) {
  const blocked = await db.userBlock.findFirst({ where: { OR: [{ blockerId: authorId, blockedId: userId }, { blockerId: userId, blockedId: authorId }] } });
  if (blocked) fail("USER_BLOCKED", "This interaction is unavailable because a user has blocked the other.", 403);
}
async function mutate(db, operation) {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(operation, { isolationLevel: "Serializable" }); }
    catch (error) {
      if (attempt < 2 && ["P2034", "P2002"].includes(error.code)) continue;
      throw error;
    }
  }
}
export async function setPostLike(db, publicId, userId, liked) {
  return mutate(db, async tx => {
    const post = await requirePost(tx, publicId);
    if (liked) {
      await requireUnblocked(tx, userId, post.authorId);
      await tx.postLike.upsert({ where: { postId_userId: { postId: post.id, userId } }, create: { postId: post.id, userId }, update: {} });
      await discoverNotification(tx,{actorId:userId,userId:post.authorId,type:"POST_LIKE",postId:publicId,key:`${post.id}:${userId}`});
    } else await tx.postLike.deleteMany({ where: { postId: post.id, userId } });
    return { liked, likeCount: await tx.postLike.count({ where: { postId: post.id } }) };
  });
}
export async function addPostComment(db, publicId, userId, value, parentCommentId=null) {
  const text = commentText(value);
  return mutate(db, async tx => {
    const post = await requirePost(tx, publicId);
    await requireUnblocked(tx, userId, post.authorId);
    await assertChatWordsAllowed(tx,text);
    const parent=parentCommentId?await tx.postComment.findFirst({where:{id:parentCommentId,postId:post.id,deletedAt:null}}):null;
    if(parentCommentId&&!parent)fail("COMMENT_NOT_FOUND","Comment not found.",404);
    if(parent)await requireUnblocked(tx,userId,parent.authorId);
    const row = await tx.postComment.create({ data: { postId: post.id, authorId: userId, text, parentId:parent?.id??null }, include: { author: { select: authorSelect } } });
    await discoverNotification(tx,{actorId:userId,userId:post.authorId,type:"POST_COMMENT",postId:publicId,commentId:row.id,key:row.id});
    if(parent)await discoverNotification(tx,{actorId:userId,userId:parent.authorId,type:"COMMENT_REPLY",postId:publicId,commentId:row.id,key:row.id});
    await notifyMentions(tx,{actorId:userId,text,postId:publicId,commentId:row.id});
    return { comment: commentDto(row), commentCount: await tx.postComment.count({ where: { postId: post.id, deletedAt: null } }) };
  });
}
export async function setCommentLike(db,publicId,userId,commentId,liked){
  return mutate(db,async tx=>{
    const post=await requirePost(tx,publicId);
    const comment=await tx.postComment.findFirst({where:{id:commentId,postId:post.id,deletedAt:null}});
    if(!comment)fail("COMMENT_NOT_FOUND","Comment not found.",404);
    if(liked){
      await requireUnblocked(tx,userId,post.authorId);await requireUnblocked(tx,userId,comment.authorId);
      await tx.postCommentLike.upsert({where:{commentId_userId:{commentId,userId}},create:{commentId,userId},update:{}});
      await discoverNotification(tx,{actorId:userId,userId:comment.authorId,type:"COMMENT_LIKE",postId:publicId,commentId,key:`${commentId}:${userId}`});
    }else await tx.postCommentLike.deleteMany({where:{commentId,userId}});
    return {liked,likeCount:await tx.postCommentLike.count({where:{commentId}})};
  });
}
export async function deletePostComment(db, publicId, userId, commentId) {
  return mutate(db, async tx => {
    const post = await requirePost(tx, publicId);
    const row = await tx.postComment.findFirst({ where: { id: commentId, postId: post.id } });
    if (!row) fail("COMMENT_NOT_FOUND", "Comment not found.", 404);
    if (row.authorId !== userId && post.authorId !== userId) fail("COMMENT_DELETE_FORBIDDEN", "Only the comment author or post author can delete this comment.", 403);
    await tx.postComment.updateMany({ where: { id: row.id, deletedAt: null }, data: { deletedAt: new Date() } });
    return { commentCount: await tx.postComment.count({ where: { postId: post.id, deletedAt: null } }) };
  });
}
export async function listPostComments(db, publicId, cursor) {
  const post = await requirePost(db, publicId);
  let after;
  if (cursor) {
    const row = await db.postComment.findFirst({ where: { id: cursor, postId: post.id } });
    if (!row) fail("INVALID_CURSOR", "Comment cursor does not belong to this post.", 422);
    // Tuple pagination still works if the cursor comment was soft-deleted.
    after = { OR: [{ createdAt: { lt: row.createdAt } }, { createdAt: row.createdAt, id: { lt: row.id } }] };
  }
  const rows = await db.postComment.findMany({ where: { postId: post.id, deletedAt: null, ...after }, include: { author: { select: authorSelect }, _count:{select:{likes:true}} }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21 });
  const page = rows.slice(0, 20);
  return { comments: page.map(commentDto), nextCursor: rows.length > 20 ? page.at(-1).id : null };
}
