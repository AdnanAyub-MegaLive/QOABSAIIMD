import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { serializeWalletTransaction } from "@/lib/wallet";

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
      const ownedCursor = await prisma.walletTransaction.findFirst({
        where: { publicId: cursor, userId: user.id },
        select: { publicId: true },
      });
      if (!ownedCursor) {
        const error = new Error("Transaction cursor is invalid.");
        error.code = "VALIDATION_ERROR";
        throw error;
      }
    }
    const records = await prisma.walletTransaction.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { publicId: cursor }, skip: 1 } : {}),
    });
    const hasMore = records.length > limit;
    const transactions = records.slice(0, limit);
    return mobileJson({
      success: true,
      data: {
        transactions: transactions.map(serializeWalletTransaction),
        nextCursor: hasMore ? transactions.at(-1).publicId : null,
      },
    });
  } catch (error) {
    console.error("Wallet transaction history failed", error);
    return mobileApiError(error, "WALLET_TRANSACTIONS_FAILED");
  }
}
