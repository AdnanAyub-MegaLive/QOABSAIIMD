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
    return record;
  });
  return serializeMessage(message, senderPerks);
}
