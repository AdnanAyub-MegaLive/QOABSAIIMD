import { prisma } from "./prisma.js";
import { resolveUserPerks } from "./user-perks.js";

export const ROOM_CHAT_VISIBLE_RETENTION_DAYS = 30;
export const ROOM_CHAT_DEFAULT_LIMIT = 30;
export const ROOM_CHAT_MAX_LIMIT = 50;

export function encodeRoomChatCursor(message) {
  return Buffer.from(JSON.stringify({ createdAt: message.createdAt.toISOString(), id: message.id })).toString("base64url");
}

export function decodeRoomChatCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    const createdAt = new Date(parsed.createdAt);
    if (!parsed.id || Number.isNaN(createdAt.getTime())) throw new Error();
    return { createdAt, id: String(parsed.id) };
  } catch {
    const error = new Error("The room chat cursor is invalid.");
    error.code = "INVALID_CURSOR";
    throw error;
  }
}

export async function serializeRoomChatMessages(messages, origin) {
  const users = messages.map((message) => message.sender).filter(Boolean);
  const perks = await resolveUserPerks(users, origin, ["BADGES", "CHAT_BOXES"]);
  return messages.map((message) => {
    const senderPerks = perks.get(message.senderPublicId);
    return {
      id: message.publicId,
      requestId: message.requestId ?? null,
      roomId: message.roomPublicId,
      chatRevision: message.chatRevision,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      sender: {
        ...senderPerks?.progression,
        publicId: message.senderPublicId,
        name: message.sender?.name ?? message.senderName,
        profileImage: message.sender?.profileImage ?? null,
        badgeUrl: senderPerks?.badgeUrl ?? null,
        chatBoxUrl: senderPerks?.chatBoxUrl ?? null,
      },
    };
  });
}

export async function readRoomChatHistory(room, origin, { cursor = null, limit = ROOM_CHAT_DEFAULT_LIMIT } = {}) {
  const take = Math.min(ROOM_CHAT_MAX_LIMIT, Math.max(1, Number(limit) || ROOM_CHAT_DEFAULT_LIMIT));
  const boundary = decodeRoomChatCursor(cursor);
  const retainedAfter = new Date(Date.now() - ROOM_CHAT_VISIBLE_RETENTION_DAYS * 86400000);
  const messages = await prisma.audioRoomMessage.findMany({
    where: {
      audioRoomId: room.id,
      chatRevision: room.chatRevision ?? 0,
      createdAt: {
        gte: retainedAfter,
        ...(boundary ? { lte: boundary.createdAt } : {}),
      },
      ...(boundary ? { NOT: { createdAt: boundary.createdAt, id: { gte: boundary.id } } } : {}),
    },
    include: { sender: { select: { id: true, publicId: true, name: true, profileImage: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
  });
  const hasMore = messages.length > take;
  const page = messages.slice(0, take);
  return {
    roomId: room.roomId,
    chatRevision: room.chatRevision ?? 0,
    retentionDays: ROOM_CHAT_VISIBLE_RETENTION_DAYS,
    nextCursor: hasMore ? encodeRoomChatCursor(page[page.length - 1]) : null,
    messages: await serializeRoomChatMessages(page, origin),
  };
}
