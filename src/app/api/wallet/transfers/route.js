import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";
import { walletEligibility } from "@/lib/wallet-eligibility";
import { notifyAction } from "@/lib/action-notifications";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { integerSetting, ledgerData, parsePositiveCoins, walletPublicId } from "@/lib/wallet";

export function OPTIONS() {
  return mobileOptions();
}

export async function POST(request) {
  try {
    const sender = await requireMobileUser(request);
    if (!sender.appRoles?.includes("RESELLER") || !walletEligibility(sender).transfer) throw new Error("RESELLER_REQUIRED");
    const body = await request.json();
    const recipientPublicId = String(body?.recipientPublicId ?? "").trim();
    const coins = parsePositiveCoins(body?.coins);
    const requestId = request.headers.get("Idempotency-Key") || body.requestId;
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(requestId ?? "")) throw Object.assign(new Error("Provide an 8–128 character requestId or Idempotency-Key."), { code: "VALIDATION_ERROR" });
    const fingerprint = createHash("sha256").update(JSON.stringify([recipientPublicId,String(coins)])).digest("hex");
    const minimum = integerSetting("WALLET_TRANSFER_MIN_COINS", 100);
    const maximum = integerSetting("WALLET_TRANSFER_MAX_COINS", 500000000);
    if (coins < minimum || coins > maximum) throw new Error("TRANSFER_LIMIT");
    const execute = () => prisma.$transaction(
      async (tx) => {
        const currentSender = await tx.user.findUniqueOrThrow({ where: { id: sender.id }, select: { appRoles: true, role:true, status: true, deletedAt: true } });
        if (!currentSender.appRoles.includes("RESELLER") || !walletEligibility(currentSender).transfer) throw new Error("RESELLER_REQUIRED");
        const old = await tx.resellerRechargeRequest.findUnique({where:{actorId_requestId:{actorId:sender.id,requestId}}});
        if (old) {
          if (old.fingerprint !== fingerprint) throw Object.assign(new Error("Request ID already used with different content."),{code:"IDEMPOTENCY_CONFLICT"});
          return old.result;
        }
        const recipient = await tx.user.findFirst({
          where: { publicId: recipientPublicId, deletedAt: null },
          select: { id: true, publicId: true, name: true, status: true },
        });
        if (!recipient) throw new Error("USER_NOT_FOUND");
        if (recipient.status !== "ACTIVE") throw new Error("RECIPIENT_INACTIVE");
        const debited = await tx.user.updateMany({
          where: { id: sender.id, status:"ACTIVE", deletedAt:null, resellerCoinBalance: { gte: coins } },
          data: { resellerCoinBalance: { decrement: coins } },
        });
        if (!debited.count) throw new Error("INSUFFICIENT_COINS");
        const credited = await tx.user.updateMany({ where: { id: recipient.id, status:"ACTIVE", deletedAt:null, coinBalance:{lte:9223372036854775807n-coins} }, data: { coinBalance: { increment: coins } } });
        if (!credited.count) throw Object.assign(new Error("Recipient balance limit exceeded."),{code:"VALIDATION_ERROR"});
        const referenceId = walletPublicId("TRF");
        const transaction = await tx.walletTransaction.create({ data: ledgerData({ userId: sender.id, type: "TRANSFER_SENT", direction: "DEBIT", title: "Business wallet recharge sent", description: `Sent to ${recipient.name} (${recipient.publicId})`, coins, referenceId, metadata: { wallet:"BUSINESS", recipientPublicId: recipient.publicId, selfRecharge:recipient.id===sender.id } }) });
        await tx.walletTransaction.create({ data: ledgerData({ userId: recipient.id, type: "TRANSFER_RECEIVED", direction: "CREDIT", title: "Personal Coins recharged", description: `Received from ${sender.name} (${sender.publicId})`, coins, referenceId, metadata: { wallet:"PERSONAL", senderPublicId: sender.publicId } }) });
        await notifyAction(tx, { userId: recipient.id, key: `reseller-topup:${referenceId}`, type: "RESELLER_TOP_UP", title: "Reseller top-up received", body: `${coins} Coins received from ${sender.name}.`, action: { screen: "WALLET", referenceId } });
        const updated = await tx.user.findUniqueOrThrow({ where: { id: sender.id }, select: { coinBalance: true, resellerCoinBalance:true } });
        const result = { transactionId:transaction.publicId, referenceId, remainingCoins:String(updated.resellerCoinBalance), businessCoins:String(updated.resellerCoinBalance), personalCoins:String(updated.coinBalance), sourceWallet:"BUSINESS", destinationWallet:"PERSONAL" };
        await tx.resellerRechargeRequest.create({data:{actorId:sender.id,requestId,fingerprint,result}});
        return result;
      },
      { isolationLevel: "Serializable" },
    );
    let result;
    for(let attempt=0;;attempt++)try{result=await execute();break;}catch(error){if(attempt>=3||!["P2034","P2002"].includes(error.code))throw error;}
    return mobileJson({ success: true, data: result }, 201);
  } catch (error) {
    console.error("Wallet transfer failed", error);
    return mobileApiError(error, "TRANSFER_FAILED");
  }
}
