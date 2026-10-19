import { randomUUID } from "node:crypto";
import { assertChatMediaAccess, chatError } from "./chat-media.js";
import { assertUsersCanInteract } from "./user-blocks.js";
import { serializeMessage } from "./messaging.js";

export async function requireChatGiftTarget(db, conversationId, senderId, recipientId) {
  const conversation = await db.conversation.findUnique({ where: { publicId: conversationId } });
  if (!conversation) throw chatError("CONVERSATION_NOT_FOUND", "Conversation not found.");
  await assertChatMediaAccess(db, conversation, senderId, true);
  if (senderId === recipientId || !await db.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: conversation.id, userId: recipientId } } })) throw chatError("RECIPIENT_UNAVAILABLE", "Choose another current member of this chat.");
  if (!await db.user.findFirst({ where: { id: recipientId, status: "ACTIVE", deletedAt: null, bans: { none: { target: "USER", revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } }, select: { id: true } })) throw chatError("RECIPIENT_UNAVAILABLE", "The recipient is unavailable.");
  await assertUsersCanInteract(senderId, recipientId, db);
  return conversation;
}
export async function writeChatGiftMessage(tx, conversation, sender, clientMessageId, payload) {
  // This runs inside the gift settlement transaction; a message failure rolls back payment.
  if (await tx.message.findUnique({ where: { senderId_clientMessageId: { senderId: sender.id, clientMessageId } }, select: { id: true } })) throw chatError("IDEMPOTENCY_CONFLICT", "This message ID is already used.");
  const record = await tx.message.create({ data: {
    publicId: `MSG-${randomUUID().replaceAll("-", "").slice(0,16).toUpperCase()}`,
    conversationId: conversation.id, senderId: sender.id, clientMessageId,
    kind: "gift", body: `Sent a gift: ${payload.gift.name} ×${payload.gift.quantity} to ${payload.recipientId}`,
    gift: payload,
  }, include: { sender: true } });
  await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: record.createdAt } });
  await tx.conversationParticipant.update({ where: { conversationId_userId: { conversationId: conversation.id, userId: sender.id } }, data: { lastReadAt: record.createdAt } });
  const recipients = await tx.conversationParticipant.findMany({ where: { conversationId: conversation.id, userId: { not: sender.id } }, select: { userId: true } });
  if (recipients.length) await tx.messageReceipt.createMany({ data: recipients.map(r => ({ messageId: record.id, userId: r.userId })) });
  const message = serializeMessage(record);
  await tx.realtimeOutbox.create({ data: { channel: `conversation:${conversation.publicId}`, event: "message:new", payload: { conversationId: conversation.publicId, message } } });
  await chatMessageNotifications(tx, conversation, sender, record, recipients, "Gift");
  return message;
}
export async function chatMessageNotifications(tx, conversation, sender, message, recipients, label) {
  for (const recipient of recipients) {
    await tx.notification.create({ data: {
      publicId: `NTF-${randomUUID()}`, userId: recipient.userId, type: "CHAT_MESSAGE",
      sourceKey: `chat:${message.id}:${recipient.userId}`, title: sender.name ?? "New message", body: label,
      action: { type: "CONVERSATION", conversationId: conversation.publicId, messageId: message.publicId, kind: message.kind },
    } });
  }
}
