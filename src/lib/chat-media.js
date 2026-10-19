import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { spacesConfig } from "./media-cdn.js";
import { assertConversationMessagingAllowed, assertUsersCanInteract } from "./user-blocks.js";

export const CHAT_MEDIA_LIMITS = Object.freeze({ pictureBytes: 10 * 1024 * 1024, videoBytes: 50 * 1024 * 1024, videoDurationMs: 60000, pictureTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"], videoTypes: ["video/mp4"], deleteWindowMs: 900000, uploadExpiresMs: 86400000 });
export function chatError(code, message) { return Object.assign(new Error(message), { code, validationMessage: message }); }
export async function assertChatMediaAccess(db, conversation, userId, sending = false) {
  if (!["DIRECT", "GROUP"].includes(conversation.kind)) throw chatError("VALIDATION_ERROR", "World Chat supports text only.");
  const member = await db.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: conversation.id, userId } } });
  if (!member) throw chatError("CONVERSATION_NOT_FOUND", "Conversation not found.");
  const user = await db.user.findFirst({ where: { id: userId, status: "ACTIVE", deletedAt: null, bans: { none: { target: "USER", revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } }, select: { id: true } });
  if (!user) throw chatError("USER_NOT_FOUND", "This account cannot use chat.");
  await assertConversationMessagingAllowed(conversation, userId, db, sending);
  // Group uploads are not a way to bypass a block with another member.
  if (conversation.kind === "GROUP" && sending) {
    const members = await db.conversationParticipant.findMany({ where: { conversationId: conversation.id, userId: { not: userId } }, select: { userId: true } });
    const ids = members.map(m => m.userId);
    if (await db.userBlock.findFirst({ where: { OR: [{ blockerId: userId, blockedId: { in: ids } }, { blockedId: userId, blockerId: { in: ids } }] } })) throw chatError("USER_BLOCKED", "A block prevents sending media in this chat.");
  }
}
export async function privateChatObject(action, key, { bytes, mimeType, range } = {}) {
  if (!/^private-chat\/[a-f0-9-]+\.(webp|mp4|jpg)$/.test(key)) throw Error("Invalid private chat object key");
  const c = spacesConfig();
  if (!c) throw chatError("CHAT_STORAGE_UNAVAILABLE", "Private media storage is unavailable.");
  const client = new S3Client({ endpoint: c.endpoint, region: "us-east-1", credentials: c.credentials, maxAttempts: 2, requestChecksumCalculation: "WHEN_REQUIRED" });
  const args = { Bucket: c.bucket, Key: key };
  try {
    return await client.send(action === "put" ? new PutObjectCommand({ ...args, Body: bytes, ACL: "private", ContentType: mimeType, CacheControl: "private, no-store" }) : action === "delete" ? new DeleteObjectCommand(args) : new GetObjectCommand({ ...args, ...(range ? { Range: range } : {}) }), { abortSignal: AbortSignal.timeout(60000) });
  } finally { if (action !== "get") client.destroy(); }
}
export function chatMediaDTO(row, conversationId) {
  const url = `/api/v1/conversations/${encodeURIComponent(conversationId)}/media/${row.id}`;
  return { id: row.id, url, mimeType: row.mimeType, width: row.width, height: row.height, durationMs: row.durationMs ?? null, mediaVersion: row.mediaVersion, posterUrl: row.posterKey ? `${url}?poster=1` : null, posterMimeType: row.posterKey ? "image/jpeg" : null };
}
export async function claimChatMedia(db, mediaId, conversation, userId) {
  await assertChatMediaAccess(db, conversation, userId, true);
  const where = { id: mediaId, conversationId: conversation.id, uploaderId: userId, ready: true, consumed: false, expiresAt: { gt: new Date() } };
  const row = await db.chatMediaObject.findFirst({ where });
  if (!row) throw chatError("CHAT_MEDIA_UNAVAILABLE", "Upload missing, expired or already sent.");
  const claimed = await db.chatMediaObject.updateMany({ where, data: { consumed: true, expiresAt: new Date(Date.now() + 30 * 86400000) } });
  if (claimed.count !== 1) throw chatError("CHAT_MEDIA_UNAVAILABLE", "This upload has already been sent.");
  return { kind: row.kind, mediaId: row.id, media: chatMediaDTO(row, conversation.publicId) };
}
export async function authorizeChatMediaRead(db, row, conversation, userId) {
  await assertChatMediaAccess(db, conversation, userId);
  if (!row?.ready || row.expiresAt <= new Date() || row.conversationId !== conversation.id) throw chatError("MESSAGE_NOT_FOUND", "Media not found.");
  await assertUsersCanInteract(userId, row.uploaderId, db);
  if (row.consumed) {
    if (!await db.message.findFirst({ where: { mediaId: row.id, conversationId: conversation.id, deletedAt: null }, select: { id: true } })) throw chatError("MESSAGE_NOT_FOUND", "Media not found.");
  } else if (row.uploaderId !== userId) throw chatError("MESSAGE_NOT_FOUND", "Media not found.");
}
export async function pruneChatMedia(db, now = new Date()) {
  const rows = await db.chatMediaObject.findMany({ where: { expiresAt: { lte: now } }, orderBy: { expiresAt: "asc" }, take: 100 });
  for (const row of rows) {
    try {
      await privateChatObject("delete", row.key);
      if (row.posterKey) await privateChatObject("delete", row.posterKey);
      await db.chatMediaObject.delete({ where: { id: row.id } });
    } catch { console.error("Private chat media cleanup will retry", row.id); }
  }
}
