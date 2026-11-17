import { prisma } from "./prisma.js";
import { emitToAudioRoom } from "./realtime.js";
import { ledgerData } from "./wallet.js";

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
