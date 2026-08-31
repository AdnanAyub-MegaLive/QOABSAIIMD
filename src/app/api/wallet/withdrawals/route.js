import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { integerSetting, ledgerData, parsePositiveCoins, serializeWithdrawal, WALLET_CURRENCY, walletPublicId } from "@/lib/wallet";

const withdrawalMethods = new Set(["jazzcash", "easypaisa", "bank_transfer"]);

export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const url = new URL(request.url);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
    const cursor = String(url.searchParams.get("cursor") ?? "").trim();
    if (cursor) {
      const ownedCursor = await prisma.walletWithdrawal.findFirst({
        where: { publicId: cursor, userId: user.id },
        select: { publicId: true },
      });
      if (!ownedCursor) {
        const error = new Error("Withdrawal cursor is invalid.");
        error.code = "VALIDATION_ERROR";
        throw error;
      }
    }
    const withdrawals = await prisma.walletWithdrawal.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { publicId: cursor }, skip: 1 } : {}),
    });
    const hasMore = withdrawals.length > limit;
    const page = withdrawals.slice(0, limit);
    return mobileJson({
      success: true,
      data: {
        withdrawals: page.map(serializeWithdrawal),
        nextCursor: hasMore ? page.at(-1)?.publicId ?? null : null,
      },
    });
  } catch (error) {
    console.error("Wallet withdrawal history failed", error);
    return mobileApiError(error, "WITHDRAWAL_HISTORY_FAILED");
  }
}

export async function POST(request) {
  try {
    const sessionUser = await requireMobileUser(request);
    const body = await request.json();
    const coins = parsePositiveCoins(body?.coins);
    const method = String(body?.method ?? "").trim().toLowerCase();
    const accountName = String(body?.accountName ?? "").trim().slice(0, 120);
    const accountNumber = String(body?.accountNumber ?? "").trim().slice(0, 80);
    if (!withdrawalMethods.has(method) || !accountName || !accountNumber) {
      const error = new Error("method, accountName, and accountNumber are required.");
      error.code = "VALIDATION_ERROR";
      throw error;
    }
    const minimum = integerSetting("WALLET_WITHDRAWAL_MIN_COINS", 10000);
    const maximum = integerSetting("WALLET_WITHDRAWAL_MAX_COINS", 10000000);
    if (coins < minimum || coins > maximum) throw new Error("WITHDRAWAL_LIMIT");
    const coinsPerCurrencyUnit = integerSetting("WALLET_WITHDRAWAL_COINS_PER_PKR", 20);
    const cashAmount = (Number(coins) / Number(coinsPerCurrencyUnit)).toFixed(2);
    const result = await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: sessionUser.id },
          select: { appRoles: true, agencyId: true, isVerified: true },
        });
        if (!user.appRoles.includes("HOST") || !user.agencyId) throw new Error("WITHDRAWAL_NOT_ALLOWED");
        if (!user.isVerified) throw new Error("KYC_REQUIRED");
        const reserved = await tx.user.updateMany({
          where: { id: sessionUser.id, hostSalaryCoinBalance: { gte: coins } },
          data: { hostSalaryCoinBalance: { decrement: coins } },
        });
        if (!reserved.count) throw new Error("INSUFFICIENT_SALARY");
        const publicId = walletPublicId("WD");
        const withdrawal = await tx.walletWithdrawal.create({
          data: { publicId, userId: sessionUser.id, coins, cashAmount, currency: WALLET_CURRENCY, method, accountName, accountNumber },
        });
        await tx.walletTransaction.create({
          data: ledgerData({ userId: sessionUser.id, type: "WITHDRAWAL", direction: "DEBIT", title: "Salary withdrawal reserved", description: `${method} payout to ${accountNumber.slice(-4).padStart(accountNumber.length, "*")}`, diamonds: coins, cashAmount, currency: WALLET_CURRENCY, referenceId: publicId, metadata: { method, workflowStatus: "PENDING_REVIEW" } }),
        });
        return withdrawal;
      },
      { isolationLevel: "Serializable" },
    );
    return mobileJson({ success: true, data: { withdrawalId: result.publicId, status: result.status, coins: result.coins.toString(), estimatedAmount: result.cashAmount.toString(), currency: result.currency } }, 201);
  } catch (error) {
    console.error("Wallet withdrawal failed", error);
    return mobileApiError(error, "WITHDRAWAL_FAILED");
  }
}
