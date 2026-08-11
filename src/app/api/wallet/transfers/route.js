import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { integerSetting, ledgerData, parsePositiveCoins, walletPublicId } from "@/lib/wallet";

export function OPTIONS() {
  return mobileOptions();
}

export async function POST(request) {
  try {
    const sender = await requireMobileUser(request);
    const body = await request.json();
    const recipientPublicId = String(body?.recipientPublicId ?? "").trim();
    const coins = parsePositiveCoins(body?.coins);
    if (recipientPublicId === sender.publicId) throw new Error("SELF_TRANSFER");
    const minimum = integerSetting("WALLET_TRANSFER_MIN_COINS", 100);
    const maximum = integerSetting("WALLET_TRANSFER_MAX_COINS", 100000);
    if (coins < minimum || coins > maximum) throw new Error("TRANSFER_LIMIT");
    const result = await prisma.$transaction(
      async (tx) => {
        const recipient = await tx.user.findFirst({
          where: { publicId: recipientPublicId, deletedAt: null },
          select: { id: true, publicId: true, name: true, status: true },
        });
        if (!recipient) throw new Error("USER_NOT_FOUND");
        if (recipient.status !== "ACTIVE") throw new Error("RECIPIENT_INACTIVE");
        const debited = await tx.user.updateMany({
          where: { id: sender.id, coinBalance: { gte: coins } },
          data: { coinBalance: { decrement: coins }, totalSpent: { increment: coins } },
        });
        if (!debited.count) throw new Error("INSUFFICIENT_COINS");
        await tx.user.update({ where: { id: recipient.id }, data: { coinBalance: { increment: coins } } });
        const referenceId = walletPublicId("TRF");
        const [transaction] = await Promise.all([
          tx.walletTransaction.create({ data: ledgerData({ userId: sender.id, type: "TRANSFER_SENT", direction: "DEBIT", title: "Coin transfer", description: `Sent to ${recipient.name} (${recipient.publicId})`, coins, referenceId, metadata: { recipientPublicId: recipient.publicId } }) }),
          tx.walletTransaction.create({ data: ledgerData({ userId: recipient.id, type: "TRANSFER_RECEIVED", direction: "CREDIT", title: "Coin transfer received", description: `Received from ${sender.name} (${sender.publicId})`, coins, referenceId, metadata: { senderPublicId: sender.publicId } }) }),
        ]);
        const updated = await tx.user.findUniqueOrThrow({ where: { id: sender.id }, select: { coinBalance: true } });
        return { transaction, balance: updated.coinBalance };
      },
      { isolationLevel: "Serializable" },
    );
    return mobileJson({ success: true, data: { transactionId: result.transaction.publicId, remainingCoins: result.balance.toString() } }, 201);
  } catch (error) {
    console.error("Wallet transfer failed", error);
    return mobileApiError(error, "TRANSFER_FAILED");
  }
}
