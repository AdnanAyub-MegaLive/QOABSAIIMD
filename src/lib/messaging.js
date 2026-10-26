import { prisma } from "./prisma.js";
import { createHash } from "node:crypto";
import { isRateLimited } from "./rate-limit.js";
import { assertChatWordsAllowed } from "./chat-word-policy.js";
import { formatDateOnly } from "./date-only.js";
import { assertConversationMessagingAllowed } from "./user-blocks.js";
import { claimChatMedia, chatError } from "./chat-media.js";
import { chatMessageNotifications } from "./chat-gifts.js";
import { groupDetails, removeGroupMemberSafely, addGroupMemberSafely } from "./group-details.js";
import { groupMemberArtwork, memberArtwork } from "./group-member-artwork.js";
import { userChatCountry, countryMessageFilter, assertNoCountryLinks, refreshCountryChatRooms } from "./country-chat.js";

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

export async function groupConversationWithArtwork(conversation, origin, db = prisma) {
  return serializeGroupConversation(conversation, await groupMemberArtwork(db, conversation.participants, origin));
}

export function serializeGroupConversation(conversation, artwork = new Map()) {
  return {
    id: conversation.publicId,
    type: "GROUP",
    name: conversation.name,
    ...groupDetails(conversation),
    createdAt: conversation.createdAt.toISOString(),
    participants: conversation.participants.map((participant) => ({
      ...memberArtwork(artwork.get(participant.user.publicId)),
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
  await assertChatWordsAllowed(prisma, name);
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
  const conversation = await prisma.conversation.create({
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
  for(const member of conversation.participants)globalThis.portalIo?.in(`user:${member.user.publicId}`).socketsJoin(`conversation:${conversation.publicId}`);
  return conversation;
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
  return addGroupMemberSafely(conversationPublicId, ownerId, targetPublicId);
}

export async function removeGroupMember(conversationPublicId, actorId, targetPublicId) {
  return removeGroupMemberSafely(conversationPublicId, actorId, targetPublicId);
}

export async function ensureWorldConversation(userId) {
  const conversation = await prisma.conversation.upsert({
    where: { publicId: WORLD_CONVERSATION_ID },
    update: {},
    create: {
      publicId: WORLD_CONVERSATION_ID,
      kind: "WORLD",
      name: "Country Chat",
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
    senderCountry: message.senderCountry ?? null,
    id: message.publicId,
    clientMessageId: message.clientMessageId ?? null,
    type: message.voiceKey ? "voice" : message.kind ?? "text",
    media: message.deletedAt ? null : message.media ?? null,
    gift: message.deletedAt ? null : message.gift ?? null,
    voice: !message.deletedAt && message.voiceKey ? {url:`/api/v1/conversations/${message.conversation?.publicId ?? message.conversationId}/voice/${message.publicId}`,durationMs:message.voiceDurationMs,mimeType:message.voiceMimeType} : null,
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
  options = {},
) {
  await assertConversationMessagingAllowed(conversation, sender.id, prisma, true);
  const senderCountry = conversation.kind==="WORLD" ? await userChatCountry(prisma,sender.id,true) : null;
  const clientMessageId = options.clientMessageId ?? null;
  if(clientMessageId!==null&&(typeof clientMessageId!=="string"||!clientMessageId.trim()||clientMessageId.length>128))throw Object.assign(new Error("Invalid client message ID."),{code:"VALIDATION_ERROR"});
  if (options.mediaId && (typeof options.mediaId !== "string" || options.mediaId.length > 128 || options.voice || !clientMessageId)) throw chatError("VALIDATION_ERROR", "Provide mediaId and clientMessageId without voice content.");
  const caption = String(rawBody ?? "").trim();
  const body = options.mediaId ? (caption || "Sent media") : options.voice ? "Voice message" : caption;
  if(conversation.kind==="WORLD")assertNoCountryLinks(body);
  const requestHash=createHash("sha256").update(JSON.stringify({conversationId:conversation.id,body,voice:options.voice?.hash??null,...(options.mediaId?{mediaId:options.mediaId}:{})})).digest("hex");
  const replay=async()=>{
    const prior=await prisma.message.findUnique({where:{senderId_clientMessageId:{senderId:sender.id,clientMessageId}},include:messageSenderInclude});
    if(prior&&prior.requestHash!==requestHash)throw Object.assign(new Error("Client message ID already used for different content."),{code:"IDEMPOTENCY_CONFLICT"});
    if(prior&&conversation.kind==="WORLD"&&prior.senderCountry!==senderCountry)throw countryChatErrorForReplay();
    return prior;
  };
  if(clientMessageId){const prior=await replay();if(prior)return serializeMessage(prior,senderPerks);}
  if(conversation.kind==="WORLD"&&isRateLimited(`world-send:${sender.id}`,{limit:5,windowMs:10000}))throw Object.assign(new Error("Please wait before sending another World Chat message."),{code:"RATE_LIMITED"});
  if((options.voice||options.mediaId)&&!["DIRECT","GROUP"].includes(conversation.kind))throw Object.assign(new Error("Media messages are for private and group chats only."),{code:"VALIDATION_ERROR"});
  if (!body || body.length > 2000) {
    const error = new Error("Message body must contain between 1 and 2000 characters.");
    error.code = "VALIDATION_ERROR";
    error.validationMessage = error.message;
    throw error;
  }
  await assertChatWordsAllowed(prisma, body);
  const createdAt = new Date();
  let message;
  try { message = await prisma.$transaction(async (tx) => {
    await assertConversationMessagingAllowed(conversation,sender.id,tx,true);
    const currentCountry=conversation.kind==="WORLD"?await userChatCountry(tx,sender.id,true):null;
    if(currentCountry!==senderCountry)throw countryChatErrorForReplay();
    const media = options.mediaId ? await claimChatMedia(tx, options.mediaId, conversation, sender.id) : null;
    const record = await tx.message.create({
      data: {
        publicId: `MSG-${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
        conversationId: conversation.id,
        senderId: sender.id,
        senderCountry,
        body: media ? (caption || (media.kind === "picture" ? "Sent a photo" : "Sent a video")) : body,
        kind: options.voice ? "voice" : media?.kind ?? "text",
        ...(media ?? {}),
        clientMessageId, requestHash,
        ...(options.voice?{voiceKey:options.voice.key,voiceDurationMs:options.voice.durationMs,voiceMimeType:options.voice.mimeType}:{}),
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
    const recipients = conversation.kind === "WORLD" ? [] : await tx.conversationParticipant.findMany({
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
    if (media) await chatMessageNotifications(tx, conversation, sender, record, recipients, media.kind === "picture" ? "Photo" : "Video");
    return record;
  }); } catch(error) { if(!["P2002","CHAT_MEDIA_UNAVAILABLE"].includes(error.code)||!clientMessageId)throw error; message=await replay();if(!message)throw error; }
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

function countryChatErrorForReplay(){return Object.assign(new Error("Country changed. Reload Country Chat."),{code:"COUNTRY_REQUIRED"});}

export async function editMessage(conversationPublicId, messagePublicId, userId, rawBody) {
  const membership = await requireConversationParticipant(conversationPublicId, userId);
  await assertConversationMessagingAllowed(membership.conversation,userId,prisma,true);
  const message = await prisma.message.findFirst({
    where: { publicId: messagePublicId, conversationId: membership.conversationId },
    select: { id: true, senderId: true, createdAt: true, deletedAt: true, kind: true, voiceKey: true },
  });
  if (!message) throw new Error("MESSAGE_NOT_FOUND");
  if (message.voiceKey || (message.kind && message.kind !== "text")) throw chatError("MESSAGE_EDIT_FORBIDDEN", "Only text messages can be edited.");
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
  const body = validatedMessageBody(rawBody);
  if(membership.conversation.kind==="WORLD"){
    assertNoCountryLinks(body);
    const country=await userChatCountry(prisma,userId,true);
    const visible=await prisma.message.findFirst({where:{id:message.id,...countryMessageFilter(country)},select:{id:true}});
    if(!visible)throw new Error("MESSAGE_NOT_FOUND");
  }
  await assertChatWordsAllowed(prisma, body);
  return prisma.message.update({
    where: { id: message.id },
    data: { body, editedAt: new Date() },
    include: messageSenderInclude,
  });
}

export async function deleteMessage(conversationPublicId, messagePublicId, userId) {
  const membership = await requireConversationParticipant(conversationPublicId, userId);
  const visibility=membership.conversation.kind==="WORLD"?countryMessageFilter(await userChatCountry(prisma,userId,true)):{};
  const message = await prisma.message.findFirst({
    where: { publicId: messagePublicId, conversationId: membership.conversationId,...visibility },
    select: { id: true, senderId: true, deletedAt: true, kind: true, voiceKey: true, createdAt: true },
  });
  if (!message) throw new Error("MESSAGE_NOT_FOUND");
  if (message.kind === "gift" || message.voiceKey) throw chatError("MESSAGE_DELETE_FORBIDDEN", "Gift and voice messages cannot be deleted.");
  if (["picture", "video"].includes(message.kind) && Date.now() - message.createdAt.getTime() > 900000) throw chatError("MESSAGE_DELETE_WINDOW_EXPIRED", "Photos and videos can only be deleted within 15 minutes.");
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
    if(membership.conversation.kind==="WORLD")return;
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
  if(membership.conversation.kind==="WORLD")return {conversationId:conversationPublicId,messageId:messagePublicId,userId,deliveredAt:null};
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
  if(conversationId===WORLD_CONVERSATION_ID){
    const country=payload.message?.senderCountry;
    if(!country)return; // No global typing/read/receipt broadcasts.
    await refreshCountryChatRooms(prisma,io);
    io.to(`conversation:${conversationId}:${country}`).emit(event,payload);return;
  }
  const conversation=await prisma.conversation.findUnique({where:{publicId:conversationId},select:{kind:true}});
  if(conversation?.kind==="GROUP"){io.to(`conversation:${conversationId}`).emit(event,payload);return;}
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
  const country=await userChatCountry(prisma,userId);
  const countryVisibility={OR:[{conversation:{kind:{not:"WORLD"}}},{conversation:{kind:"WORLD"},...countryMessageFilter(country)}]};
  let cursorRecord = null;
  if (cursor) {
    cursorRecord = await prisma.message.findFirst({
      where: {
        publicId: cursor,
        conversation: { participants: { some: { userId } } },
        AND:[countryVisibility],
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
      AND:[countryVisibility],
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
