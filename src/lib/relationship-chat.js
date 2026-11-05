import { randomUUID } from 'node:crypto';
import { serializeMessage } from './messaging.js';

export async function relationshipChatMessage(tx, relationship, actor, target, action) {
  if (!['REQUEST', 'ACCEPT', 'REJECT'].includes(action)) return;
  const directKey = [actor.id, target.id].sort().join(':');
  const conversation = await tx.conversation.upsert({ where: { directKey }, update: {}, create: {
    publicId: 'CONV-' + randomUUID(), kind: 'DIRECT', directKey,
    participants: { create: [{ userId: actor.id }, { userId: target.id }] },
  } });
  const text = { REQUEST: 'wants to be your CP', ACCEPT: 'accepted your CP request', REJECT: 'declined your CP request' }[action];
  const record = await tx.message.create({ data: {
    publicId: 'MSG-' + randomUUID(), conversationId: conversation.id, senderId: actor.id,
    kind: 'RELATIONSHIP', body: '💞 ' + actor.name + ' ' + text,
    metadata: { relationshipId: relationship.publicId, type: 'CP', action },
  }, include: { sender: true } });
  await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: record.createdAt } });
  await tx.conversationParticipant.update({ where: { conversationId_userId: { conversationId: conversation.id, userId: actor.id } }, data: { lastReadAt: record.createdAt } });
  await tx.messageReceipt.create({ data: { messageId: record.id, userId: target.id } });
  // User channels also reach people whose newly created chat is not joined yet.
  const payload = { conversationId: conversation.publicId, message: serializeMessage(record) };
  await tx.realtimeOutbox.createMany({ data: [actor, target].map(user => ({
    channel: 'user:' + user.publicId, event: 'message:new', payload,
  })) });
}
