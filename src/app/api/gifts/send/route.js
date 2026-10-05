import { giftOperation, priorGiftOperation, runGiftOperation, flushRealtimeOutbox } from "@/lib/gift-operation";
import { awardGiftProgress, appendOutbox, publicProgression } from "@/lib/progression";
import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";
import { coinsForShare, getProfitSplitRule } from "@/lib/profit-rules";
import { audioRoomParticipantIds } from "@/lib/realtime";
import { createPublicDisplayAssetUrl } from "@/lib/upload-assets";
import { requestOrigin } from "@/lib/user-perks";
import { resolveGiftSender } from "@/lib/gift-sender";
import { ledgerData } from "@/lib/wallet";
import { getRoomGiftLeaderboard } from "@/lib/gift-leaderboard";
import { addDailyTaskProgress } from "@/lib/daily-tasks";
import { randomInt } from "node:crypto";
import { parseGiftBatchId } from "@/lib/gift-batch";

export function OPTIONS() {
  return mobileOptions();
}

export async function POST(request) {
  try {
    const sessionUser = await requireMobileUser(request);
    const body = await request.json();
    const operation = giftOperation(body, request.headers.get("Idempotency-Key"), "PAID");
    const replay = await priorGiftOperation(sessionUser.id, operation);
    if (replay) return mobileJson(replay, 201);
    const giftBatchId = parseGiftBatchId(body?.giftBatchId);
    const comboId = parseGiftBatchId(body?.comboId);
    const recipientId = String(body?.recipientId ?? "").trim();
    const giftId = String(body?.giftId ?? "").trim();
    const roomId = String(body?.roomId ?? "").trim().slice(0, 120) || null;
    const liveId = String(body?.liveId ?? "").trim().slice(0, 120) || null;
    const quantity = Number(body?.quantity ?? 1);
    if (
      !recipientId ||
      !giftId ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 999
    ) {
      const error = new Error(
        "recipientId, giftId, and a quantity between 1 and 999 are required.",
      );
      error.code = "VALIDATION_ERROR";
      throw error;
    }
    if (roomId && liveId) throw Object.assign(new Error("Choose either an audio room or live video."), { code: "VALIDATION_ERROR" });
    if (!roomId && !liveId && recipientId === sessionUser.publicId) {
      const error = new Error("You cannot send a gift to yourself.");
      error.code = "VALIDATION_ERROR";
      throw error;
    }

    const [giftAsset, recipientUser, talent, policy, room, live] = await Promise.all([
      prisma.uploadAsset.findFirst({
        where: {
          publicId: giftId,
          category: "GIFTS",
          active: true,
          giftTier: { in: ["CLASSIC", "PREMIUM", "VIP", "LUCKY", "BLIND_BOX"] },
          coinPrice: { gt: 0n },
        },
        select: {
          id: true,
          publicId: true,
          name: true,
          giftTier: true,
          mimeType: true,
          posterMimeType: true,
          coinPrice: true,
          giftRewardMinBps: true,
          giftRewardMaxBps: true,
        },
      }),
      prisma.user.findFirst({
        where: { publicId: recipientId, deletedAt: null },
        select: { id: true, publicId: true, name: true, appRoles: true, agencyId: true },
      }),
      prisma.talent.findUnique({
        where: { publicId: recipientId },
        select: { id: true, publicId: true, displayName: true, agencyId: true },
      }),
      getProfitSplitRule(),
      roomId
        ? prisma.audioRoom.findFirst({
            where: { roomId, status: "LIVE" },
            select: { id: true },
          })
        : Promise.resolve(null),
      liveId ? prisma.videoLiveSession.findFirst({ where: { publicId: liveId, status: "LIVE" }, include: { viewers: { where: { userId: sessionUser.id, active: true }, take: 1 }, host: { select: { publicId: true } } } }) : Promise.resolve(null),
    ]);
    if (!giftAsset) {
      const error = new Error("The selected gift is unavailable.");
      error.code = "GIFT_NOT_FOUND";
      throw error;
    }
    if (!recipientUser && !talent) throw new Error("USER_NOT_FOUND");
    if (roomId && !room) {
      const error = new Error("The selected audio room is not live.");
      error.code = "ROOM_NOT_LIVE";
      throw error;
    }
    if (liveId && (!live || live.host.publicId !== recipientId || (live.hostId !== sessionUser.id && !live.viewers.length))) throw Object.assign(new Error("Join this live video before sending a gift to its host."), { code: "LIVE_GIFT_FORBIDDEN" });
    if (roomId) {
      const participants = await audioRoomParticipantIds(roomId);
      if (!participants.has(sessionUser.publicId) || !participants.has(recipientId)) {
        const error = new Error("Both sender and recipient must be in this audio room.");
        error.code = "ROOM_PARTICIPANT_REQUIRED";
        throw error;
      }
    }
    const grossCoins = giftAsset.coinPrice * BigInt(quantity);
    let luckyRewardBps = 0;
    let requestedLuckyReward = 0n;
    if (giftAsset.giftTier === "LUCKY") {
      const min = Math.max(0, Math.min(50_000, giftAsset.giftRewardMinBps ?? 0));
      const max = Math.max(min, Math.min(50_000, giftAsset.giftRewardMaxBps ?? 10_000));
      luckyRewardBps = randomInt(min, max + 1);
      requestedLuckyReward = coinsForShare(grossCoins, luckyRewardBps);
    }
    const blindBoxReward = giftAsset.giftTier === "BLIND_BOX"
      ? await prisma.uploadAsset.findFirst({
          where: { category: "GIFTS", active: true, giftTier: { in: ["CLASSIC", "PREMIUM", "VIP"] } },
          select: { id: true, publicId: true, name: true, mimeType: true, coinPrice: true },
          orderBy: { createdAt: "asc" },
          skip: randomInt(0, Math.max(1, await prisma.uploadAsset.count({ where: { category: "GIFTS", active: true, giftTier: { in: ["CLASSIC", "PREMIUM", "VIP"] } } }))),
        })
      : null;
    const isHost = Boolean(talent || recipientUser?.appRoles.includes("HOST"));
    const agencyId = talent?.agencyId ?? recipientUser?.agencyId ?? null;
    if (isHost && !agencyId) {
      const error = new Error("Hosts must belong to an agency before receiving gifts.");
      error.code = "HOST_AGENCY_REQUIRED";
      throw error;
    }

    const response = await runGiftOperation(sessionUser.id, operation, async (tx) => {
      const emitToUser = (id,event,payload) => appendOutbox(tx,`user:${id}`,event,payload.data);
      const emitToAudioRoom = (id,event,payload) => appendOutbox(tx,`audio-room:${id}`,event,payload.data);
      const emitToVideoLive = (id,event,payload) => appendOutbox(tx,`live-video:${id}`,event,payload.data);
      const debited = await tx.user.updateMany({
        where: { id: sessionUser.id, coinBalance: { gte: grossCoins } },
        data: {
          coinBalance: { decrement: grossCoins },
          totalSpent: { increment: grossCoins },
        },
      });
      if (!debited.count) throw new Error("INSUFFICIENT_COINS");

      const hostSalaryCoins = isHost
        ? coinsForShare(grossCoins, policy.hostShareBps)
        : 0n;
      const agencyCoins = isHost
        ? coinsForShare(grossCoins, policy.agencyShareBps)
        : 0n;
      const reusableCoins = isHost
        ? 0n
        : coinsForShare(grossCoins, policy.normalUserReusableShareBps);
      let companyCoins = isHost
        ? grossCoins - hostSalaryCoins - agencyCoins
        : grossCoins - reusableCoins;
      const luckyRewardCoins = requestedLuckyReward > companyCoins ? companyCoins : requestedLuckyReward;
      companyCoins -= luckyRewardCoins;

      const gift = await tx.giftTransaction.create({
        data: {
          senderId: sessionUser.id,
          giftBatchId,
          talentId: talent?.id ?? null,
          recipientUserId: recipientUser?.id ?? null,
          giftAssetId: giftAsset.id,
          giftName: giftAsset.name,
          quantity,
          coinValue: grossCoins,
          roomId,
          liveSessionId: live?.id ?? null,
        },
      });
      await tx.walletTransaction.create({
        data: ledgerData({
          userId: sessionUser.id,
          type: "GIFT_SENT",
          direction: "DEBIT",
          title: `Sent ${giftAsset.name}`,
          description: `To ${recipientId}`,
          coins: grossCoins,
          referenceId: gift.id,
          metadata: { giftId: giftAsset.publicId, quantity, recipientId, roomId, liveId },
        }),
      });
      if (talent)
        await tx.talent.update({
          where: { id: talent.id },
          data: {
            totalGiftsValue: { increment: grossCoins },
            hostSalaryCoinBalance: { increment: hostSalaryCoins },
          },
        });
      else if (recipientUser)
        await tx.user.update({
          where: { id: recipientUser.id },
          data: isHost
            ? { hostSalaryCoinBalance: { increment: hostSalaryCoins } }
            : { coinBalance: { increment: reusableCoins } },
        });
      if (recipientUser && (isHost ? hostSalaryCoins : reusableCoins) > 0n)
        await tx.walletTransaction.create({
          data: ledgerData({
            userId: recipientUser.id,
            type: "GIFT_RECEIVED",
            direction: "CREDIT",
            title: "Received from Gift",
            description: `From ${sessionUser.name} (${sessionUser.publicId})`,
            ...(isHost
              ? { diamonds: hostSalaryCoins }
              : { coins: reusableCoins }),
            referenceId: gift.id,
            metadata: {
              giftId: giftAsset.publicId,
              quantity,
              grossCoins: grossCoins.toString(),
              recipientType: isHost ? "HOST" : "NORMAL_USER",
            },
          }),
        });
      if (agencyId)
        await tx.agency.update({
          where: { id: agencyId },
          data: { commissionCoinBalance: { increment: agencyCoins } },
        });
      const settlement = await tx.giftSettlement.create({
        data: {
          giftTransactionId: gift.id,
          agencyId,
          recipientType: isHost ? "HOST" : "NORMAL_USER",
          grossCoins,
          hostSalaryCoins,
          agencyCoins,
          companyCoins,
          reusableCoins,
          hostShareBps: isHost ? policy.hostShareBps : 0,
          agencyShareBps: isHost ? policy.agencyShareBps : 0,
          companyShareBps: isHost
            ? policy.companyShareBps
            : 10000 - policy.normalUserReusableShareBps,
          reusableShareBps: policy.normalUserReusableShareBps,
          policyVersion: policy.version,
        },
      });
      if (blindBoxReward) await tx.userGiftInventory.upsert({
        where: { userId_giftAssetId: { userId: sessionUser.id, giftAssetId: blindBoxReward.id } },
        create: { userId: sessionUser.id, giftAssetId: blindBoxReward.id, quantity },
        update: { quantity: { increment: quantity } },
      });
      await tx.auditLog.create({
        data: {
          action: "GIFT_SETTLED",
          category: "FINANCE",
          entityType: "GiftTransaction",
          entityId: gift.id,
          description: `Gift from ${sessionUser.publicId} to ${recipientId} was settled using profit policy version ${policy.version}.`,
          metadata: {
            source: "MOBILE_APP",
            recipientId,
            recipientType: settlement.recipientType,
            grossCoins: grossCoins.toString(),
            hostSalaryCoins: hostSalaryCoins.toString(),
            agencyCoins: agencyCoins.toString(),
            companyCoins: companyCoins.toString(),
            reusableCoins: reusableCoins.toString(),
          },
        },
      });
      if (luckyRewardCoins > 0n) { await tx.user.update({ where: { id: sessionUser.id }, data: { coinBalance: { increment: luckyRewardCoins } } }); await tx.walletTransaction.create({ data: ledgerData({ userId: sessionUser.id, type: "LUCKY_GIFT_REWARD", direction: "CREDIT", title: "Lucky Gift reward", coins: luckyRewardCoins, referenceId: gift.id, metadata: { giftId: giftAsset.publicId, rewardBps: luckyRewardBps } }) }); }
      const sender = await tx.user.findUniqueOrThrow({
        where: { id: sessionUser.id },
        select: { coinBalance: true },
      });
      const liveTotals = live ? await tx.videoLiveSession.update({ where: { id: live.id }, data: { giftIncome: { increment: grossCoins }, revision: { increment: 1 } }, select: { giftIncome: true, revision: true } }) : null;
      const progression = await awardGiftProgress(tx, {sender:sessionUser,recipient:talent ? null : recipientUser,gift,source:giftAsset.giftTier === "LUCKY" ? "LUCKY" : giftAsset.giftTier === "BLIND_BOX" ? "BLIND_BOX" : "PAID",gross:grossCoins,credit:hostSalaryCoins+reusableCoins,reward:luckyRewardCoins,revealed:blindBoxReward ? blindBoxReward.coinPrice*BigInt(quantity) : 0n,recipientType:isHost ? "HOST" : "NORMAL_USER",origin:requestOrigin(request)});
      const result = { gift, settlement, sender, luckyRewardCoins, liveTotals, progression };

    const origin = requestOrigin(request);
    const giftSender = { ...await resolveGiftSender(sessionUser, origin), ...(await publicProgression([sessionUser], origin, tx)).get(sessionUser.publicId) };
    const revealedGift = blindBoxReward ? { publicId: blindBoxReward.publicId, name: blindBoxReward.name, mimeType: blindBoxReward.mimeType, quantity, mediaUrl: createPublicDisplayAssetUrl(origin, blindBoxReward.publicId) } : null;
    const mediaUrl = createPublicDisplayAssetUrl(origin, giftAsset.publicId);
    const giftDetails = { publicId: giftAsset.publicId, name: giftAsset.name, mimeType: giftAsset.mimeType, mediaUrl, posterUrl: giftAsset.posterMimeType ? `${mediaUrl}&poster=1` : null, coinPrice: giftAsset.coinPrice.toString() };
    const extras = { giftBatchId: result.gift.giftBatchId, comboId, lucky: giftAsset.giftTier === "LUCKY" ? { rewardCoins: result.luckyRewardCoins.toString(), rewardBps: luckyRewardBps } : null, blindBox: revealedGift ? { revealedGift } : null };
    if (live) {
      const updatedLive = result.liveTotals;
      const liveGiftData = { liveId: live.publicId, transactionId: result.gift.id, createdAt: result.gift.createdAt.toISOString(), giftIncome: updatedLive.giftIncome.toString(), revision: updatedLive.revision, sender: giftSender, gift: giftDetails, ...extras, recipientId, giftId: giftAsset.publicId, quantity, totalCoins: grossCoins.toString() };
      await emitToVideoLive(live.publicId, "live-video:gift", { success: true, data: liveGiftData });
      const pk = await tx.videoLivePkSession.findFirst({ where: { status: "LIVE", OR: [{ leftSessionId: live.id }, { rightSessionId: live.id }] }, include: { leftSession: true, rightSession: true } });
      if (pk) {
        const field = pk.leftSessionId === live.id ? "leftScore" : "rightScore";
        const scored = await tx.videoLivePkSession.update({ where: { id: pk.id }, data: { [field]: { increment: grossCoins }, revision: { increment: 1 } } });
        const data = { id: scored.id, leftLiveId: pk.leftSession.publicId, rightLiveId: pk.rightSession.publicId, leftScore: scored.leftScore.toString(), rightScore: scored.rightScore.toString(), revision: scored.revision };
        await emitToVideoLive(pk.leftSession.publicId, "live-video:pk-score", { success: true, data }); await emitToVideoLive(pk.rightSession.publicId, "live-video:pk-score", { success: true, data });
      }
    }

    await addDailyTaskProgress(sessionUser.id, "SEND_GIFTS", quantity, new Date(), tx);
    await addDailyTaskProgress(sessionUser.id, "TOP_SUPPORTER", quantity, new Date(), tx);
    const realtimePayload = {
      success: true,
      data: {
        transactionId: result.gift.id,
        ...extras,
        giftBatchId: result.gift.giftBatchId,
        roomId,
        liveId,
        sender: giftSender,
        recipientId,
        gift: {
          id: giftAsset.publicId,
          name: giftAsset.name,
          category: giftAsset.giftTier,
          mimeType: giftAsset.mimeType,
          mediaUrl,
          unitPrice: giftAsset.coinPrice.toString(),
          quantity,
          totalCoins: grossCoins.toString(),
        },
        createdAt: result.gift.createdAt.toISOString(),
      },
    };
    if (roomId) {
      await emitToAudioRoom(roomId, "gift:received", realtimePayload);
      try {
        const pk = await tx.audioRoomPkSession.findFirst({ where: { status: "LIVE", OR: [{ leftRoom: { roomId } }, { rightRoom: { roomId } }] }, include: { leftRoom: true, rightRoom: true } });
        if (pk) {
          const side = pk.leftRoom.roomId === roomId ? "leftScore" : "rightScore";
          const updatedPk = await tx.audioRoomPkSession.update({ where: { id: pk.id }, data: { [side]: { increment: grossCoins }, revision: { increment: 1 } } });
          const pkData = { id: updatedPk.id, status: updatedPk.status, leftRoomId: pk.leftRoom.roomId, rightRoomId: pk.rightRoom.roomId, leftScore: updatedPk.leftScore.toString(), rightScore: updatedPk.rightScore.toString(), revision: updatedPk.revision, endsAt: updatedPk.endsAt?.toISOString() ?? null };
          await emitToAudioRoom(pk.leftRoom.roomId, "audio-room:pk-score", { success: true, data: pkData });
          await emitToAudioRoom(pk.rightRoom.roomId, "audio-room:pk-score", { success: true, data: pkData });
        }
      } catch (pkError) { console.error("PK gift score update failed", pkError); }
      try {
        const leaderboard = await getRoomGiftLeaderboard(roomId, origin, tx);
        await emitToAudioRoom(roomId, "audio-room:gift-leaderboard", {
          success: true,
          data: { roomId, ...leaderboard },
        });
      } catch (leaderboardError) {
        console.error("Room gift leaderboard update failed", leaderboardError);
      }
    } else if (!liveId) await emitToUser(recipientId, "gift:received", realtimePayload);

    return (
      {
        success: true,
        data: {
          transactionId: result.gift.id,
          progression: result.progression,
          giftBatchId: result.gift.giftBatchId,
          giftId: giftAsset.publicId,
          giftName: giftAsset.name,
          giftCategory: giftAsset.giftTier,
          mediaUrl,
          unitPrice: giftAsset.coinPrice.toString(),
          quantity,
          recipientId,
          recipientType: result.settlement.recipientType,
          grossCoins: result.settlement.grossCoins.toString(),
          hostSalaryCoins: result.settlement.hostSalaryCoins.toString(),
          agencyCoins: result.settlement.agencyCoins.toString(),
          companyCoins: result.settlement.companyCoins.toString(),
          reusableCoins: result.settlement.reusableCoins.toString(),
          policyVersion: result.settlement.policyVersion,
          senderCoinBalance: result.sender.coinBalance.toString(),
          createdAt: result.gift.createdAt.toISOString(),
          luckyRewardCoins: result.luckyRewardCoins.toString(),
          revealedGift,
        },
      }
    );
    });
    void flushRealtimeOutbox().catch(error => console.error("Outbox flush failed", error.message));
    return mobileJson(response, 201);
  } catch (error) {
    if (error?.message === "INSUFFICIENT_COINS")
      return mobileJson(
        { success: false, error: { code: "INSUFFICIENT_COINS", message: "Your coin balance is too low for this gift." } },
        409,
      );
    if (error?.code === "HOST_AGENCY_REQUIRED")
      return mobileJson(
        { success: false, error: { code: error.code, message: error.message } },
        409,
      );
    if (error?.code === "ROOM_PARTICIPANT_REQUIRED")
      return mobileJson(
        { success: false, error: { code: error.code, message: error.message } },
        403,
      );
    if (error?.code === "GIFT_NOT_FOUND" || error?.code === "ROOM_NOT_LIVE")
      return mobileJson(
        { success: false, error: { code: error.code, message: error.message } },
        404,
      );
    console.error("Gift settlement failed", error);
    return mobileApiError(error, "GIFT_SEND_FAILED");
  }
}
