import { prisma } from "./prisma.js";
import { formatDateOnly } from "./date-only.js";

export const WORLD_CONVERSATION_ID = "CONV-WORLD";

export async function ensureWorldConversation(userId) {
  const conversation = await prisma.conversation.upsert({
    where: { publicId: WORLD_CONVERSATION_ID },
    update: {},
    create: {
      publicId: WORLD_CONVERSATION_ID,
      kind: "WORLD",
      name: "World Chat",
    },
  });
  if (userId)
    await prisma.conversationParticipant.upsert({
      where: {
        conversationId_userId: {
          conversationId: conversation.id,
          userId,
        },
      },
      update: {},
      create: { conversationId: conversation.id, userId },
    });
  return conversation;
}

export async function requireConversationParticipant(publicId, userId) {
  if (publicId === WORLD_CONVERSATION_ID)
    await ensureWorldConversation(userId);
  const participant = await prisma.conversationParticipant.findFirst({
    where: { userId, conversation: { publicId } },
    include: { conversation: true },
  });
  if (!participant) throw new Error("CONVERSATION_NOT_FOUND");
  return participant;
}

export function serializeMessage(message, senderPerks) {
  return {
    id: message.publicId,
    senderId: message.sender?.publicId ?? null,
    senderName: message.sender?.name ?? "System",
    senderProfileImage: message.sender?.profileImage ?? null,
    senderGender: message.sender?.gender ?? null,
    senderDob: formatDateOnly(message.sender?.dob),
    senderIsVerified: Boolean(message.sender?.isVerified),
    senderIsOfficial: Boolean(message.sender?.isOfficial),
    senderFrameUrl: senderPerks?.frameUrl ?? null,
    senderBadgeUrl: senderPerks?.badgeUrl ?? null,
    senderChatBoxUrl: senderPerks?.chatBoxUrl ?? null,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function createMessage(
  conversation,
  sender,
  rawBody,
  senderPerks,
) {
  const body = String(rawBody ?? "").trim();
  if (!body || body.length > 2000) {
    const error = new Error("Message body must contain between 1 and 2000 characters.");
    error.code = "VALIDATION_ERROR";
    error.validationMessage = error.message;
    throw error;
  }
  const createdAt = new Date();
  const message = await prisma.$transaction(async (tx) => {
    const record = await tx.message.create({
      data: {
        publicId: `MSG-${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
        conversationId: conversation.id,
        senderId: sender.id,
        body,
        createdAt,
      },
      include: {
        sender: {
          select: {
            publicId: true,
            name: true,
            profileImage: true,
            gender: true,
            dob: true,
            isVerified: true,
            isOfficial: true,
          },
        },
      },
    });
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: createdAt },
    });
    await tx.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId: conversation.id,
          userId: sender.id,
        },
      },
      data: { lastReadAt: createdAt },
    });
    const recipients = await tx.conversationParticipant.findMany({
      where: { conversationId: conversation.id, userId: { not: sender.id } },
      select: { userId: true },
    });
    if (recipients.length) {
      await tx.messageReceipt.createMany({
        data: recipients.map((recipient) => ({
          messageId: record.id,
          userId: recipient.userId,
        })),
      });
    }
    return record;
  });
  return serializeMessage(message, senderPerks);
}

export async function markConversationRead(membership, userId, readAt = new Date()) {
  await prisma.$transaction(async (tx) => {
    await tx.conversationParticipant.update({
      where: { id: membership.id },
      data: { lastReadAt: readAt },
    });
    await tx.messageReceipt.updateMany({
      where: {
        userId,
        readAt: null,
        message: { conversationId: membership.conversationId },
      },
      data: { readAt },
    });
    await tx.messageReceipt.updateMany({
      where: {
        userId,
        deliveredAt: null,
        message: { conversationId: membership.conversationId },
      },
      data: { deliveredAt: readAt },
    });
  });
  return {
    conversationId: membership.conversation.publicId,
    userId,
    lastReadAt: readAt.toISOString(),
  };
}

export async function markMessageDelivered(conversationPublicId, messagePublicId, userId) {
  const membership = await requireConversationParticipant(conversationPublicId, userId);
  const receipt = await prisma.messageReceipt.findFirst({
    where: {
      userId,
      message: {
        publicId: messagePublicId,
        conversationId: membership.conversationId,
      },
    },
    include: { message: { select: { id: true } } },
  });
  if (!receipt) {
    const exists = await prisma.message.findFirst({
      where: { publicId: messagePublicId, conversationId: membership.conversationId },
      select: { id: true },
    });
    if (!exists) throw new Error("MESSAGE_NOT_FOUND");
    const error = new Error("MESSAGE_RECEIPT_FORBIDDEN");
    error.code = "MESSAGE_RECEIPT_FORBIDDEN";
    throw error;
  }
  const deliveredAt = receipt.deliveredAt ?? new Date();
  if (!receipt.deliveredAt) {
    await prisma.messageReceipt.update({
      where: { messageId_userId: { messageId: receipt.message.id, userId } },
      data: { deliveredAt },
    });
  }
  return {
    conversationId: membership.conversation.publicId,
    messageId: messagePublicId,
    userId,
    deliveredAt: deliveredAt.toISOString(),
  };
}

export async function emitConversationEvent(io, conversationId, event, payload) {
  if (!io) return;
  const participants = await prisma.conversationParticipant.findMany({
    where: { conversation: { publicId: conversationId } },
    select: { user: { select: { publicId: true } } },
  });
  let delivery = io.to(`conversation:${conversationId}`);
  for (const participant of participants) {
    delivery = delivery.to(`user:${participant.user.publicId}`);
  }
  delivery.emit(event, payload);
}

export function messageSyncLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return 50;
  return limit;
}

export async function syncMessagesForUser(userId, { cursor = null, limit = 50 } = {}) {
  let cursorRecord = null;
  if (cursor) {
    cursorRecord = await prisma.message.findFirst({
      where: {
        publicId: cursor,
        conversation: { participants: { some: { userId } } },
      },
      select: { id: true, createdAt: true },
    });
    if (!cursorRecord) {
      const error = new Error("SYNC_CURSOR_INVALID");
      error.code = "SYNC_CURSOR_INVALID";
      throw error;
    }
  }
  const records = await prisma.message.findMany({
    where: {
      conversation: { participants: { some: { userId } } },
      ...(cursorRecord
        ? {
            OR: [
              { createdAt: { gt: cursorRecord.createdAt } },
              { createdAt: cursorRecord.createdAt, id: { gt: cursorRecord.id } },
            ],
          }
        : {}),
    },
    include: {
      sender: {
        select: {
          publicId: true,
          name: true,
          profileImage: true,
          gender: true,
          dob: true,
          isVerified: true,
          isOfficial: true,
        },
      },
      conversation: { select: { publicId: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  const hasMore = records.length > limit;
  const page = records.slice(0, limit);
  return {
    records: page,
    hasMore,
    nextCursor: hasMore ? page[page.length - 1]?.publicId ?? null : null,
  };
}
