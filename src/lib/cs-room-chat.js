import { randomUUID } from "node:crypto";
import { CS_LEGACY_MAX_VERSION, CS_PRESENCE_STALE_MS, csRoomCountry, csStaffCountry } from "./cs-rooms.js";
import { serializeRoomChatMessages } from "./audio-room-chat.js";
import { resolveRoomMentions } from "./room-mentions.js";
import { assertChatWordsAllowed } from "./chat-word-policy.js";
import { isRateLimited } from "./rate-limit.js";
import { resolveUserPerks } from "./user-perks.js";
import { versionMediaPayload } from "./media-payload.js";

export const CS_CHAT_PREFIX = "cs-room:";
export const CS_CHAT_MAX_LENGTH = 200;

function failure(code, message) {
  return { success: false, error: { code, message } };
}

function channelOf(country) {
  return `${CS_CHAT_PREFIX}${country}`;
}

function scopedUser(user, socket) {
  const versionCode = Number.parseInt(String(socket.handshake?.auth?.versionCode ?? ""), 10);
  return { ...user, csLegacy: !Number.isInteger(versionCode) || versionCode <= CS_LEGACY_MAX_VERSION };
}

async function presentIn(db, userId, country, now = new Date()) {
  const presence = await db.csRoomPresence.findUnique({ where: { userId }, select: { country: true, removedAt: true, lastSeenAt: true } });
  return Boolean(presence && presence.country === country && !presence.removedAt && presence.lastSeenAt >= new Date(now.getTime() - CS_PRESENCE_STALE_MS));
}

const ENTRY_REPEAT_MS = 60_000;

function isNewEntry(publicId, country, now = Date.now()) {
  globalThis.portalCsEntries ??= new Map();
  const seen = globalThis.portalCsEntries;
  const key = `${publicId}|${country}`;
  const last = seen.get(key);
  seen.set(key, now);
  if (seen.size > 5000) for (const [k, at] of seen) if (now - at > ENTRY_REPEAT_MS) seen.delete(k);
  return !(last && now - last < ENTRY_REPEAT_MS);
}

export function registerCsRoomChat({ io, socket, user, origin, db }) {
  const leaveAll = () => { for (const room of socket.rooms) if (room.startsWith(CS_CHAT_PREFIX)) socket.leave(room); };

  socket.on("cs-room:join", async ({ country } = {}, ack = () => {}) => {
    try {
      const scoped = scopedUser(user, socket);
      const code = csRoomCountry(country, scoped);
      if (!(await presentIn(db, user.id, code))) return ack(failure("CS_ROOM_NOT_JOINED", "Join the support room first."));
      const channel = channelOf(code);
      const fresh = !socket.rooms.has(channel);
      leaveAll();
      socket.join(channel);
      if (fresh && isNewEntry(user.publicId, code)) {
        const perks = (await resolveUserPerks([user], origin, ["ENTRANCES"]).catch(() => new Map())).get(user.publicId);
        if (!(perks?.vipPrivileges ?? []).includes("INVISIBLE_ENTRY")) {
          const payload = { success: true, data: { country: code, publicId: user.publicId, name: user.name, profileImage: user.profileImage ?? null, at: new Date().toISOString(), isOfficial: Boolean(user.isOfficial), entranceUrl: perks?.entranceUrl ?? null, entranceMimeType: perks?.entranceMimeType ?? null } };
          io.to(channel).emit("cs-room:entered", await versionMediaPayload(payload).catch(() => payload));
        }
      }
      ack({ success: true, data: { country: code } });
    } catch (error) {
      ack(failure(error?.code ?? "CS_CHAT_FAILED", error?.message ?? "Unable to join the chat."));
    }
  });

  socket.on("cs-room:leave", (_input = {}, ack = () => {}) => { leaveAll(); ack({ success: true }); });

  socket.on("cs-room:message", async ({ country, body, requestId, mentions } = {}, ack = () => {}) => {
    try {
      const scoped = scopedUser(user, socket);
      const code = csRoomCountry(country, scoped);
      const channel = channelOf(code);
      if (!socket.rooms.has(channel)) return ack(failure("JOIN_ROOM_FIRST", "Join the support room first."));
      const text = typeof body === "string" ? body.trim() : "";
      if (!text || text.length > CS_CHAT_MAX_LENGTH) return ack(failure("VALIDATION_ERROR", "Messages must be between 1 and 200 characters."));
      if (await isRateLimited(`cs-chat:${user.id}`, { limit: 20, windowMs: 60_000 })) return ack(failure("RATE_LIMITED", "You are sending messages too fast."));
      const now = new Date();
      if (!(await presentIn(db, user.id, code, now))) return ack(failure("CS_ROOM_NOT_JOINED", "Join the support room first."));
      if (await db.csRoomBan.findFirst({ where: { userId: user.id, country: code, expiresAt: { gt: now } }, select: { id: true } })) return ack(failure("CS_ROOM_BANNED", "You are banned from this support room for now."));
      if (await db.csRoomMute.findUnique({ where: { country_userId: { country: code, userId: user.id } }, select: { userId: true } })) return ack(failure("CS_CHAT_MUTED", "A support admin has muted you."));
      await assertChatWordsAllowed(db, text);
      const participants = new Set((await io.in(channel).fetchSockets()).map((s) => s.data.userId).filter(Boolean));
      const resolvedMentions = await resolveRoomMentions(db, body, mentions, Array.isArray(mentions) && mentions.length ? participants : new Set());
      const [data] = await serializeRoomChatMessages([{
        publicId: `CSM-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
        requestId: String(requestId ?? "").trim().slice(0, 100) || null,
        roomPublicId: `cs-${code}`,
        chatRevision: 0,
        body: text,
        mentions: resolvedMentions,
        createdAt: now,
        senderPublicId: user.publicId,
        senderName: user.name,
        sender: { id: user.id, publicId: user.publicId, name: user.name, profileImage: user.profileImage },
      }], origin);
      await db.csRoomMessage.create({ data: { publicId: data.id ?? data.publicId, country: code, senderId: user.id, body: text, mentions: resolvedMentions?.length ? resolvedMentions : undefined, createdAt: now } }).catch((error) => console.error("CS room message persist failed", error?.code ?? error?.name));
      io.to(channel).emit("cs-room:message", { success: true, data });
      ack({ success: true, data });
    } catch (error) {
      if (["INAPPROPRIATE_WORD", "VALIDATION_ERROR", "CS_ROOM_NOT_FOUND", "CS_ROOM_PAKISTAN_ONLY", "CS_ROOM_OTHER_COUNTRY"].includes(error?.code)) return ack(failure(error.code, error.message));
      console.error("CS room message failed", error?.code ?? error?.name);
      ack(failure("MESSAGE_SEND_FAILED", "Unable to send this message."));
    }
  });

  socket.on("cs-room:delete-message", async ({ country, messageId } = {}, ack = () => {}) => {
    try {
      const scoped = scopedUser(user, socket);
      const code = csRoomCountry(country, scoped);
      if (csStaffCountry(scoped) !== code) return ack(failure("CS_ADMIN_ONLY", "Only this country's support team can manage this room."));
      const id = String(messageId ?? "").trim();
      if (!id || id.length > 64) return ack(failure("VALIDATION_ERROR", "Choose a message."));
      await db.csRoomMessage.updateMany({ where: { publicId: id, country: code, deletedAt: null }, data: { deletedAt: new Date(), deletedById: user.id } }).catch((error) => console.error("CS room message delete persist failed", error?.code ?? error?.name));
      io.to(channelOf(code)).emit("cs-room:message-deleted", { success: true, data: { country: code, id } });
      ack({ success: true });
    } catch (error) {
      ack(failure(error?.code ?? "CS_CHAT_FAILED", error?.message ?? "Unable to delete this message."));
    }
  });

  socket.on("cs-room:clear-chat", async ({ country } = {}, ack = () => {}) => {
    try {
      const scoped = scopedUser(user, socket);
      const code = csRoomCountry(country, scoped);
      if (csStaffCountry(scoped) !== code) return ack(failure("CS_ADMIN_ONLY", "Only this country's support team can clear this chat."));
      await db.csRoomMessage.updateMany({ where: { country: code, clearedAt: null }, data: { clearedAt: new Date(), clearedById: user.id } }).catch((error) => console.error("CS room chat clear persist failed", error?.code ?? error?.name));
      io.to(channelOf(code)).emit("cs-room:chat-cleared", { success: true, data: { country: code } });
      ack({ success: true });
    } catch (error) {
      ack(failure(error?.code ?? "CS_CHAT_FAILED", error?.message ?? "Unable to clear the chat."));
    }
  });

  socket.on("disconnect", leaveAll);
}
