import "server-only";

import { prisma } from "./prisma.js";
import { audioRoomParticipantIds, emitToAudioRoom } from "./realtime.js";
import { ledgerData, walletPublicId } from "./wallet.js";
import { luckyShare, parseRedEnvelopeInput } from "./red-envelope-contract.js";

export { luckyShare, parseRedEnvelopeInput } from "./red-envelope-contract.js";

function redEnvelopeError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function getRedEnvelopeConfiguration({ includeInactive = false } = {}) {
  const [settings, presets] = await Promise.all([
    prisma.redEnvelopeSettings.upsert({
      where: { id: "DEFAULT" },
      create: { id: "DEFAULT" },
      update: {},
    }),
    prisma.redEnvelopePreset.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  return {
    settings: {
      enabled: settings.enabled,
      maxCoins: settings.maxCoins.toString(),
      maxShareCount: settings.maxShareCount,
      maxDelaySeconds: settings.maxDelaySeconds,
      claimWindowSeconds: settings.claimWindowSeconds,
      updatedAt: settings.updatedAt.toISOString(),
    },
    presets: presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      totalCoins: preset.totalCoins.toString(),
      shareCount: preset.shareCount,
      delaySeconds: preset.delaySeconds,
      sortOrder: preset.sortOrder,
      active: preset.active,
      updatedAt: preset.updatedAt.toISOString(),
    })),
  };
}

export function serializeRedEnvelope(item, currentUserId = null) {
  const ownClaim = item.claims?.find((claim) => claim.userId === currentUserId) ?? null;
  return {
    id: item.id,
    roomId: item.audioRoom.roomId,
    sender: {
      publicId: item.sender.publicId,
      name: item.sender.name,
      profileImage: item.sender.profileImage ?? null,
    },
    totalCoins: item.totalCoins.toString(),
    remainingCoins: item.remainingCoins.toString(),
    shareCount: item.shareCount,
    remainingShares: item.remainingShares,
    delaySeconds: item.delaySeconds,
    claimableAt: item.claimableAt.toISOString(),
    expiresAt: item.expiresAt.toISOString(),
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    myClaim: ownClaim ? { amountCoins: ownClaim.amountCoins.toString(), claimedAt: ownClaim.claimedAt.toISOString() } : null,
    claims: item.claims?.map((claim) => ({
      user: { publicId: claim.user.publicId, name: claim.user.name, profileImage: claim.user.profileImage ?? null },
      amountCoins: claim.amountCoins.toString(),
      claimedAt: claim.claimedAt.toISOString(),
    })) ?? [],
  };
}

const envelopeInclude = {
  audioRoom: { select: { roomId: true } },
  sender: { select: { publicId: true, name: true, profileImage: true } },
  claims: { orderBy: { claimedAt: "asc" }, include: { user: { select: { publicId: true, name: true, profileImage: true } } } },
};

export async function requireRoomParticipant(roomId, userPublicId) {
  const room = await prisma.audioRoom.findFirst({ where: { roomId, status: { in: ["LIVE", "IDLE"] }, isBlocked: false }, select: { id: true, roomId: true } });
  if (!room) throw redEnvelopeError("ROOM_UNAVAILABLE");
  const participants = await audioRoomParticipantIds(roomId);
  if (!participants.has(userPublicId)) throw redEnvelopeError("ROOM_PARTICIPANT_REQUIRED");
  return room;
}

export async function expireRedEnvelopes(roomId = null, now = new Date()) {
  const expired = await prisma.redEnvelope.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: now }, ...(roomId ? { audioRoom: { roomId } } : {}) },
    select: { id: true, senderId: true, remainingCoins: true, audioRoom: { select: { roomId: true } } },
  });
  for (const item of expired) {
    const refunded = await prisma.$transaction(async (tx) => {
      const changed = await tx.redEnvelope.updateMany({ where: { id: item.id, status: "ACTIVE" }, data: { status: "EXPIRED", remainingCoins: 0n, remainingShares: 0 } });
      if (!changed.count) return false;
      if (item.remainingCoins > 0n) {
        await tx.user.update({ where: { id: item.senderId }, data: { coinBalance: { increment: item.remainingCoins } } });
        await tx.walletTransaction.create({ data: ledgerData({ userId: item.senderId, type: "RED_ENVELOPE_REFUND", direction: "CREDIT", title: "Expired red envelope refund", coins: item.remainingCoins, referenceId: item.id, metadata: { roomId: item.audioRoom.roomId } }) });
      }
      return true;
    });
    if (refunded) emitToAudioRoom(item.audioRoom.roomId, "audio-room:red-envelope", { success: true, data: { action: "EXPIRED", envelopeId: item.id, roomId: item.audioRoom.roomId, remainingShares: 0 } });
  }
}

export async function createRedEnvelope(user, input, now = new Date()) {
  const configuration = await getRedEnvelopeConfiguration();
  if (!configuration.settings.enabled) throw redEnvelopeError("RED_ENVELOPE_DISABLED");
  const room = await requireRoomParticipant(input.roomId, user.publicId);
  await expireRedEnvelopes(input.roomId, now);
  const claimableAt = new Date(now.getTime() + input.delaySeconds * 1000);
  const lifetimeSeconds = configuration.settings.claimWindowSeconds;
  const expiresAt = new Date(claimableAt.getTime() + lifetimeSeconds * 1000);
  const id = walletPublicId("RED");
  const envelope = await prisma.$transaction(async (tx) => {
    const debit = await tx.user.updateMany({ where: { id: user.id, coinBalance: { gte: input.totalCoins } }, data: { coinBalance: { decrement: input.totalCoins } } });
    if (!debit.count) throw redEnvelopeError("INSUFFICIENT_COINS");
    const created = await tx.redEnvelope.create({ data: { id, audioRoomId: room.id, senderId: user.id, totalCoins: input.totalCoins, remainingCoins: input.totalCoins, shareCount: input.shareCount, remainingShares: input.shareCount, delaySeconds: input.delaySeconds, claimableAt, expiresAt }, include: envelopeInclude });
    await tx.walletTransaction.create({ data: ledgerData({ userId: user.id, type: "RED_ENVELOPE_SENT", direction: "DEBIT", title: "Red envelope sent", coins: input.totalCoins, referenceId: id, metadata: { roomId: input.roomId, shareCount: input.shareCount } }) });
    return created;
  });
  const data = serializeRedEnvelope(envelope, user.id);
  emitToAudioRoom(input.roomId, "audio-room:red-envelope", { success: true, data: { action: "CREATED", ...data } });
  return data;
}

export async function listRedEnvelopes(roomId, user) {
  await requireRoomParticipant(roomId, user.publicId);
  await expireRedEnvelopes(roomId);
  const items = await prisma.redEnvelope.findMany({ where: { audioRoom: { roomId }, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, include: envelopeInclude });
  return items.map((item) => serializeRedEnvelope(item, user.id));
}

export async function getRedEnvelope(id, user) {
  const item = await prisma.redEnvelope.findUnique({ where: { id }, include: envelopeInclude });
  if (!item) throw redEnvelopeError("RED_ENVELOPE_NOT_FOUND");
  await requireRoomParticipant(item.audioRoom.roomId, user.publicId);
  await expireRedEnvelopes(item.audioRoom.roomId);
  const current = await prisma.redEnvelope.findUnique({ where: { id }, include: envelopeInclude });
  return serializeRedEnvelope(current, user.id);
}

export async function claimRedEnvelope(id, user, now = new Date()) {
  const found = await prisma.redEnvelope.findUnique({ where: { id }, select: { audioRoom: { select: { roomId: true } } } });
  if (!found) throw redEnvelopeError("RED_ENVELOPE_NOT_FOUND");
  await requireRoomParticipant(found.audioRoom.roomId, user.publicId);
  await expireRedEnvelopes(found.audioRoom.roomId, now);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const envelope = await tx.redEnvelope.findUnique({ where: { id }, include: { claims: { where: { userId: user.id }, select: { id: true } } } });
        if (!envelope) throw redEnvelopeError("RED_ENVELOPE_NOT_FOUND");
        if (envelope.claims.length) throw redEnvelopeError("RED_ENVELOPE_ALREADY_CLAIMED");
        if (envelope.status !== "ACTIVE" || envelope.expiresAt <= now || envelope.remainingShares < 1 || envelope.remainingCoins < 1n) throw redEnvelopeError("RED_ENVELOPE_UNAVAILABLE");
        if (envelope.claimableAt > now) throw redEnvelopeError("RED_ENVELOPE_NOT_READY");
        const amountCoins = luckyShare(envelope.remainingCoins, envelope.remainingShares);
        const depleted = envelope.remainingShares === 1;
        const updated = await tx.redEnvelope.updateMany({ where: { id, status: "ACTIVE", remainingCoins: envelope.remainingCoins, remainingShares: envelope.remainingShares }, data: { remainingCoins: { decrement: amountCoins }, remainingShares: { decrement: 1 }, ...(depleted ? { status: "DEPLETED" } : {}) } });
        if (!updated.count) throw Object.assign(new Error("CLAIM_CONFLICT"), { code: "P2034" });
        const claim = await tx.redEnvelopeClaim.create({ data: { envelopeId: id, userId: user.id, amountCoins } });
        const balance = await tx.user.update({ where: { id: user.id }, data: { coinBalance: { increment: amountCoins } }, select: { coinBalance: true } });
        await tx.walletTransaction.create({ data: ledgerData({ userId: user.id, type: "RED_ENVELOPE_CLAIMED", direction: "CREDIT", title: "Red envelope claimed", coins: amountCoins, referenceId: id, metadata: { claimId: claim.id, roomId: found.audioRoom.roomId } }) });
        return { claim, balance, remainingCoins: envelope.remainingCoins - amountCoins, remainingShares: envelope.remainingShares - 1, status: depleted ? "DEPLETED" : "ACTIVE" };
      }, { isolationLevel: "Serializable" });
      const data = { envelopeId: id, roomId: found.audioRoom.roomId, user: { publicId: user.publicId, name: user.name, profileImage: user.profileImage ?? null }, amountCoins: result.claim.amountCoins.toString(), coinBalance: result.balance.coinBalance.toString(), remainingCoins: result.remainingCoins.toString(), remainingShares: result.remainingShares, status: result.status, claimedAt: result.claim.claimedAt.toISOString() };
      emitToAudioRoom(found.audioRoom.roomId, "audio-room:red-envelope", { success: true, data: { action: "CLAIMED", ...data } });
      return data;
    } catch (error) {
      if (error?.code === "P2002") throw redEnvelopeError("RED_ENVELOPE_ALREADY_CLAIMED");
      if (error?.code !== "P2034" || attempt === 2) throw error;
    }
  }
}
