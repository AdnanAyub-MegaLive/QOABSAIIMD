import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { WALLET_CURRENCY } from "@/lib/wallet";

export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request) {
  try {
    const sessionUser = await requireMobileUser(request);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: sessionUser.id },
      select: {
        coinBalance: true,
        hostSalaryCoinBalance: true,
        couponBalance: true,
        totalTopUp: true,
        updatedAt: true,
      },
    });
    return mobileJson({
      success: true,
      data: {
        coins: user.coinBalance.toString(),
        diamonds: user.hostSalaryCoinBalance.toString(),
        coupons: user.couponBalance,
        totalRecharge: user.totalTopUp.toString(),
        currency: WALLET_CURRENCY,
        updatedAt: user.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Wallet overview failed", error);
    return mobileApiError(error, "WALLET_FAILED");
  }
}
