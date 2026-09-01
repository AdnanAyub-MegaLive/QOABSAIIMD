import { prisma } from "./prisma.js";
import { formatDateOnly } from "./date-only.js";
import { assertConversationMessagingAllowed } from "./user-blocks.js";

export const WORLD_CONVERSATION_ID = "CONV-WORLD";

const participantUserSelect = {
  id: true,
  publicId: true,
  name: true,
  profileImage: true,
  isVerified: true,
  isOfficial: true,
};

const groupConversationInclude = {
  participants: {
    include: { user: { select: participantUserSelect } },
    orderBy: { joinedAt: "asc" },
  },
};

export function normalizeGroupName(rawName) {
  const name = String(rawName ?? "").trim();
  if (name.length < 2 || name.length > 80) {
    const error = new Error("GROUP_NAME_INVALID");
    error.code = "GROUP_NAME_INVALID";
    throw error;
  }
  return name;
}

export function normalizeGroupMemberIds(rawPublicIds, creatorPublicId) {
  if (!Array.isArray(rawPublicIds)) {
    const error = new Error("GROUP_MEMBERS_INVALID");
    error.code = "GROUP_MEMBERS_INVALID";
    throw error;
  }
  const ids = [...new Set(rawPublicIds.map((item) => String(item ?? "").trim()))]
    .filter((id) => id && id !== creatorPublicId);
  if (!ids.length || ids.length > 99) {
    const error = new Error("GROUP_MEMBERS_INVALID");
    error.code = "GROUP_MEMBERS_INVALID";
    throw error;
  }
  return ids;
}

export function serializeGroupConversation(conversation) {
  return {
    id: conversation.publicId,
    type: "GROUP",
    name: conversation.name,
    createdAt: conversation.createdAt.toISOString(),
    participants: conversation.participants.map((participant) => ({
      id: participant.user.publicId,
      name: participant.user.name,
      profileImage: participant.user.profileImage ?? null,
      isVerified: Boolean(participant.user.isVerified),
      isOfficial: Boolean(participant.user.isOfficial),
      role: participant.role,
      joinedAt: participant.joinedAt.toISOString(),
    })),
  };
}

export async function createGroupConversation(creator, rawName, rawMemberPublicIds) {
  const name = normalizeGroupName(rawName);
  const publicIds = normalizeGroupMemberIds(rawMemberPublicIds, creator.publicId);
  const members = await prisma.user.findMany({
    where: { publicId: { in: publicIds }, deletedAt: null, status: "ACTIVE" },
    select: { id: true, publicId: true },
  });
  if (members.length !== publicIds.length) {
    const error = new Error("GROUP_MEMBER_NOT_FOUND");
    error.code = "GROUP_MEMBER_NOT_FOUND";
    throw error;
  }
  return prisma.conversation.create({
    data: {
      publicId: `CONV-${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
      kind: "GROUP",
      name,
      createdById: creator.id,
      participants: {
        create: [
          { userId: creator.id, role: "OWNER" },
          ...members.map((member) => ({ userId: member.id, role: "MEMBER" })),
        ],
      },
    },
    include: groupConversationInclude,
  });
}

export async function requireGroupOwner(conversationPublicId, userId) {
  const membership = await requireConversationParticipant(conversationPublicId, userId);
  if (membership.conversation.kind !== "GROUP") {
    const error = new Error("GROUP_CONVERSATION_REQUIRED");
    error.code = "GROUP_CONVERSATION_REQUIRED";
    throw error;
  }
  if (membership.role !== "OWNER") {
    const error = new Error("GROUP_OWNER_REQUIRED");
    error.code = "GROUP_OWNER_REQUIRED";
    throw error;
  }
  return membership;
}

export async function addGroupMember(conversationPublicId, ownerId, targetPublicId) {
  const membership = await requireGroupOwner(conversationPublicId, ownerId);
  const target = await prisma.user.findFirst({
    where: { publicId: targetPublicId, deletedAt: null, status: "ACTIVE" },
    select: { id: true },
  });
  if (!target) {
    const error = new Error("GROUP_MEMBER_NOT_FOUND");
    error.code = "GROUP_MEMBER_NOT_FOUND";
    throw error;
  }
  const existing = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: membership.conversationId, userId: target.id } },
    select: { id: true },
  });
  if (existing) {
    const error = new Error("GROUP_MEMBER_EXISTS");
    error.code = "GROUP_MEMBER_EXISTS";
    throw error;
  }
  const conversation = await prisma.conversation.update({
    where: { id: membership.conversationId },
    data: { participants: { create: { userId: target.id, role: "MEMBER" } } },
    include: groupConversationInclude,
  });
  return conversation;
}

export async function removeGroupMember(conversationPublicId, actorId, targetPublicId) {
  const membership = await requireConversationParticipant(conversationPublicId, actorId);
  if (membership.conversation.kind !== "GROUP") {
    const error = new Error("GROUP_CONVERSATION_REQUIRED");
    error.code = "GROUP_CONVERSATION_REQUIRED";
    throw error;
  }
  const target = await prisma.user.findFirst({
    where: { publicId: targetPublicId },
    select: { id: true },
  });
  if (!target) {
    const error = new Error("GROUP_MEMBER_NOT_FOUND");
    error.code = "GROUP_MEMBER_NOT_FOUND";
    throw error;
  }
  const targetMembership = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: membership.conversationId, userId: target.id } },
    select: { id: true, role: true },
  });
  if (!targetMembership) {
    const error = new Error("GROUP_MEMBER_NOT_FOUND");
    error.code = "GROUP_MEMBER_NOT_FOUND";
    throw error;
  }
  const isSelf = target.id === actorId;
  if (!isSelf && membership.role !== "OWNER") {
    const error = new Error("GROUP_OWNER_REQUIRED");
    error.code = "GROUP_OWNER_REQUIRED";
    throw error;
  }
  if (targetMembership.role === "OWNER") {
    const error = new Error("GROUP_OWNER_CANNOT_LEAVE");
    error.code = "GROUP_OWNER_CANNOT_LEAVE";
    throw error;
  }
  await prisma.conversationParticipant.delete({ where: { id: targetMembership.id } });
  return prisma.conversation.findUnique({
    where: { id: membership.conversationId },
    include: groupConversationInclude,
  });
}

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
  await assertConversationMessagingAllowed(participant.conversation, userId);
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
    body: message.deletedAt ? null : message.body,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
  };
}

export async function createMessage(
  conversation,
  sender,
  rawBody,
  senderPerks,
) {
  await assertConversationMessagingAllowed(conversation, sender.id);
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

function validatedMessageBody(rawBody) {
  const body = String(rawBody ?? "").trim();
  if (!body || body.length > 2000) {
    const error = new Error("Message body must contain between 1 and 2000 characters.");
    error.code = "VALIDATION_ERROR";
    error.validationMessage = error.message;
    throw error;
  }
  return body;
}

const messageSenderInclude = {
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
};

export async function editMessage(conversationPublicId, messagePublicId, userId, rawBody) {
  const membership = await requireConversationParticipant(conversationPublicId, userId);
  const message = await prisma.message.findFirst({
    where: { publicId: messagePublicId, conversationId: membership.conversationId },
    select: { id: true, senderId: true, createdAt: true, deletedAt: true },
  });
  if (!message) throw new Error("MESSAGE_NOT_FOUND");
  if (message.senderId !== userId) {
    const error = new Error("MESSAGE_EDIT_FORBIDDEN");
    error.code = "MESSAGE_EDIT_FORBIDDEN";
    throw error;
  }
  if (message.deletedAt) {
    const error = new Error("MESSAGE_DELETED");
    error.code = "MESSAGE_DELETED";
    throw error;
  }
  if (Date.now() - message.createdAt.getTime() > 15 * 60 * 1000) {
    const error = new Error("MESSAGE_EDIT_WINDOW_EXPIRED");
    error.code = "MESSAGE_EDIT_WINDOW_EXPIRED";
    throw error;
  }
  return prisma.message.update({
    where: { id: message.id },
    data: { body: validatedMessageBody(rawBody), editedAt: new Date() },
    include: messageSenderInclude,
  });
}

export async function deleteMessage(conversationPublicId, messagePublicId, userId) {
  const membership = await requireConversationParticipant(conversationPublicId, userId);
  const message = await prisma.message.findFirst({
    where: { publicId: messagePublicId, conversationId: membership.conversationId },
    select: { id: true, senderId: true, deletedAt: true },
  });
  if (!message) throw new Error("MESSAGE_NOT_FOUND");
  if (message.senderId !== userId) {
    const error = new Error("MESSAGE_DELETE_FORBIDDEN");
    error.code = "MESSAGE_DELETE_FORBIDDEN";
    throw error;
  }
  if (message.deletedAt) {
    const error = new Error("MESSAGE_DELETED");
    error.code = "MESSAGE_DELETED";
    throw error;
  }
  return prisma.message.update({
    where: { id: message.id },
    data: { deletedAt: new Date(), deletedById: userId },
    include: messageSenderInclude,
  });
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
