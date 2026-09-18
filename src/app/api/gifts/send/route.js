import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";
import { coinsForShare, getProfitSplitRule } from "@/lib/profit-rules";
import { audioRoomParticipantIds, emitToAudioRoom, emitToUser } from "@/lib/realtime";
import { createPublicDisplayAssetUrl } from "@/lib/upload-assets";
import { requestOrigin } from "@/lib/user-perks";
import { ledgerData } from "@/lib/wallet";

export function OPTIONS() {
  return mobileOptions();
}

export async function POST(request) {
  try {
    const sessionUser = await requireMobileUser(request);
    const body = await request.json();
    const recipientId = String(body?.recipientId ?? "").trim();
    const giftId = String(body?.giftId ?? "").trim();
    const roomId = String(body?.roomId ?? "").trim().slice(0, 120) || null;
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
    if (!roomId && recipientId === sessionUser.publicId) {
      const error = new Error("You cannot send a gift to yourself.");
      error.code = "VALIDATION_ERROR";
      throw error;
    }

    const [giftAsset, recipientUser, talent, policy, room] = await Promise.all([
      prisma.uploadAsset.findFirst({
        where: {
          publicId: giftId,
          category: "GIFTS",
          active: true,
          giftTier: { in: ["CLASSIC", "PREMIUM", "VIP"] },
          coinPrice: { gt: 0n },
        },
        select: {
          id: true,
          publicId: true,
          name: true,
          giftTier: true,
          mimeType: true,
          coinPrice: true,
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
    if (roomId) {
      const participants = await audioRoomParticipantIds(roomId);
      if (!participants.has(sessionUser.publicId) || !participants.has(recipientId)) {
        const error = new Error("Both sender and recipient must be in this audio room.");
        error.code = "ROOM_PARTICIPANT_REQUIRED";
        throw error;
      }
    }
    const grossCoins = giftAsset.coinPrice * BigInt(quantity);
    const isHost = Boolean(talent || recipientUser?.appRoles.includes("HOST"));
    const agencyId = talent?.agencyId ?? recipientUser?.agencyId ?? null;
    if (isHost && !agencyId) {
      const error = new Error("Hosts must belong to an agency before receiving gifts.");
      error.code = "HOST_AGENCY_REQUIRED";
      throw error;
    }

    const result = await prisma.$transaction(async (tx) => {
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
      const companyCoins = isHost
        ? grossCoins - hostSalaryCoins - agencyCoins
        : grossCoins - reusableCoins;

      const gift = await tx.giftTransaction.create({
        data: {
          senderId: sessionUser.id,
          talentId: talent?.id ?? null,
          recipientUserId: recipientUser?.id ?? null,
          giftAssetId: giftAsset.id,
          giftName: giftAsset.name,
          quantity,
          coinValue: grossCoins,
          roomId,
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
          metadata: { giftId: giftAsset.publicId, quantity, recipientId, roomId },
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
      const sender = await tx.user.findUniqueOrThrow({
        where: { id: sessionUser.id },
        select: { coinBalance: true },
      });
      return { gift, settlement, sender };
    });

    const mediaUrl = createPublicDisplayAssetUrl(
      requestOrigin(request),
      giftAsset.publicId,
    );
    const realtimePayload = {
      success: true,
      data: {
        transactionId: result.gift.id,
        roomId,
        sender: { id: sessionUser.publicId, name: sessionUser.name },
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
    if (roomId) emitToAudioRoom(roomId, "gift:received", realtimePayload);
    else emitToUser(recipientId, "gift:received", realtimePayload);

    return mobileJson(
      {
        success: true,
        data: {
          transactionId: result.gift.id,
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
        },
      },
      201,
    );
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
