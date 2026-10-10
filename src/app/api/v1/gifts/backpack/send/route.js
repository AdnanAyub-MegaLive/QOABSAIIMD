import { currencyPolicy, giftDiamonds } from "@/lib/currency-policy";
import { giftOperation, priorGiftOperation, runGiftOperation, flushRealtimeOutbox } from "@/lib/gift-operation";
import { awardGiftProgress, appendOutbox, publicProgression } from "@/lib/progression";
import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { audioRoomParticipantIds } from "@/lib/realtime";
import { coinsForShare, getProfitSplitRule } from "@/lib/profit-rules";
import { ledgerData } from "@/lib/wallet";
import { addDailyTaskProgress } from "@/lib/daily-tasks";
import { getRoomGiftLeaderboard } from "@/lib/gift-leaderboard";
import { createPublicDisplayAssetUrl } from "@/lib/upload-assets";
import { requestOrigin } from "@/lib/user-perks";
import { resolveGiftSender } from "@/lib/gift-sender";
import { parseGiftBatchId } from "@/lib/gift-batch";

export function OPTIONS() { return mobileOptions(); }

export async function POST(request) {
  try {
    const sender = await requireMobileUser(request), body = await request.json();
    const operation=giftOperation(body,request.headers.get("Idempotency-Key"),"BACKPACK");
    const replay=await priorGiftOperation(sender.id,operation); if(replay)return mobileJson({success:true,data:replay},201);
    const giftBatchId = parseGiftBatchId(body?.giftBatchId);
    const giftId = String(body?.giftId ?? ""), recipientId = String(body?.recipientId ?? ""), roomId = String(body?.roomId ?? ""), quantity = Number(body?.quantity ?? 1);
    if (!giftId || !recipientId || !roomId || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw Object.assign(new Error("Valid gift, recipient, room and quantity are required."), { code: "VALIDATION_ERROR" });
    const [gift, recipient, room, policy, participants] = await Promise.all([
      prisma.uploadAsset.findFirst({ where: { publicId: giftId, category: "GIFTS", active: true, coinPrice: { gt: 0n } } }),
      prisma.user.findFirst({ where: { publicId: recipientId, deletedAt: null, status: "ACTIVE" } }),
      prisma.audioRoom.findFirst({ where: { roomId, status: "LIVE" } }), getProfitSplitRule(), audioRoomParticipantIds(roomId),
    ]);
    if (!gift) throw new Error("GIFT_NOT_FOUND");
    if (!recipient) throw new Error("USER_NOT_FOUND");
    if (!room) throw new Error("ROOM_UNAVAILABLE");
    if (!participants.has(sender.publicId) || !participants.has(recipient.publicId)) throw new Error("ROOM_PARTICIPANT_REQUIRED");
    const gross = gift.coinPrice * BigInt(quantity), host = recipient.appRoles.includes("HOST");
    if (host && !recipient.agencyId) throw new Error("HOST_AGENCY_REQUIRED");
    const response = await runGiftOperation(sender.id,operation,async (tx) => {
      const emitToAudioRoom=(id,event,payload)=>appendOutbox(tx,`audio-room:${id}`,event,payload.data);
      const used = await tx.userGiftInventory.updateMany({ where: { userId: sender.id, giftAssetId: gift.id, quantity: { gte: quantity } }, data: { quantity: { decrement: quantity } } });
      if (!used.count) throw new Error("BACKPACK_INSUFFICIENT");
      const hostCoins = host ? coinsForShare(gross, policy.hostShareBps) : 0n, agencyCoins = host ? coinsForShare(gross, policy.agencyShareBps) : 0n, reusable = host ? 0n : coinsForShare(gross, policy.normalUserReusableShareBps), company = gross - hostCoins - agencyCoins - reusable;
      const currency=await currencyPolicy(tx),credit=giftDiamonds(gross,hostCoins+reusable,currency);
      const giftTx = await tx.giftTransaction.create({ data: { giftBatchId, senderId: sender.id, recipientUserId: recipient.id, giftAssetId: gift.id, giftName: gift.name, quantity, coinValue: gross, roomId } });
      await tx.giftSettlement.create({ data: { giftTransactionId: giftTx.id, recipientDiamonds:credit,currencyPolicyVersion:currency.version, agencyId: recipient.agencyId, recipientType: host ? "HOST" : "NORMAL_USER", grossCoins: gross, hostSalaryCoins: hostCoins, agencyCoins, companyCoins: company, reusableCoins: reusable, hostShareBps: host ? policy.hostShareBps : 0, agencyShareBps: host ? policy.agencyShareBps : 0, companyShareBps: host ? policy.companyShareBps : 10000 - policy.normalUserReusableShareBps, reusableShareBps: policy.normalUserReusableShareBps, policyVersion: policy.version } });
      await tx.user.update({ where: { id: recipient.id }, data: { hostSalaryCoinBalance: { increment: credit } } });

      if (credit > 0n) await tx.walletTransaction.create({ data: ledgerData({ userId: recipient.id, type: "GIFT_RECEIVED", direction: "CREDIT", title: `Received ${gift.name}`, diamonds: credit, referenceId: giftTx.id, metadata: { senderId: sender.publicId, roomId, giftId, quantity, source: "BACKPACK" } }) });
      if (recipient.agencyId) await tx.agency.update({ where: { id: recipient.agencyId }, data: { commissionCoinBalance: { increment: agencyCoins } } });
      await tx.auditLog.create({ data: { action: "BACKPACK_GIFT_SENT", category: "FINANCE", entityType: "GiftTransaction", entityId: giftTx.id, description: `${sender.publicId} sent backpack gift ${gift.publicId} to ${recipient.publicId}.`, metadata: { roomId, quantity, grossCoins: gross.toString() } } });
      const progression=await awardGiftProgress(tx,{sender,recipient,gift:giftTx,source:"BACKPACK",gross,credit,recipientType:host?"HOST":"NORMAL_USER",origin:requestOrigin(request)});
      const result=giftTx;
    const origin = requestOrigin(request), giftSender = { ...await resolveGiftSender(sender, origin), ...(await publicProgression([sender],origin,tx)).get(sender.publicId) }, data = { transactionId: result.id, roomId, giftId, recipientId, quantity, totalCoins: gross.toString(), source: "BACKPACK", sender: giftSender, gift: { id: gift.publicId, name: gift.name, mimeType: gift.mimeType, mediaUrl: createPublicDisplayAssetUrl(origin, gift.publicId) } };
    data.giftBatchId = result.giftBatchId;
    await emitToAudioRoom(roomId, "gift:received", { success: true, data });
    const pk = await tx.audioRoomPkSession.findFirst({ where: { status: "LIVE", OR: [{ leftRoomId: room.id }, { rightRoomId: room.id }] }, include: { leftRoom: true, rightRoom: true } });
    if (pk) { const side = pk.leftRoomId === room.id ? "leftScore" : "rightScore", updated = await tx.audioRoomPkSession.update({ where: { id: pk.id }, data: { [side]: { increment: gross }, revision: { increment: 1 } } }), payload = { id: pk.id, leftRoomId: pk.leftRoom.roomId, rightRoomId: pk.rightRoom.roomId, leftScore: updated.leftScore.toString(), rightScore: updated.rightScore.toString(), revision: updated.revision }; await emitToAudioRoom(pk.leftRoom.roomId, "audio-room:pk-score", { success: true, data: payload }); await emitToAudioRoom(pk.rightRoom.roomId, "audio-room:pk-score", { success: true, data: payload }); }
    const leaderboard = await getRoomGiftLeaderboard(roomId, origin, tx);
    await emitToAudioRoom(roomId, "audio-room:gift-leaderboard", { success: true, data: { roomId, ...leaderboard } });
    await addDailyTaskProgress(sender.id,"SEND_GIFTS",quantity,new Date(),tx);
    await addDailyTaskProgress(sender.id,"TOP_SUPPORTER",quantity,new Date(),tx);
    return {...data,progression};
    });
    void flushRealtimeOutbox().catch(error=>console.error("Outbox flush failed",error.message));
    return mobileJson({success:true,data:response},201);
  } catch (error) { return mobileApiError(error, error?.message === "BACKPACK_INSUFFICIENT" ? "BACKPACK_INSUFFICIENT" : "BACKPACK_SEND_FAILED"); }
}
