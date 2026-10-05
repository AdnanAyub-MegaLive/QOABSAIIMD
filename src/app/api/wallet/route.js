import { prisma } from "@/lib/prisma";
import { exchangeSettings } from "@/lib/diamond-exchange";
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
        diamondExchangeEnabled: true,
        appRoles: true,
        hostSalaryCoinBalance: true,
        couponBalance: true,
        totalTopUp: true,
        updatedAt: true,
      },
    });
    const settings = await exchangeSettings();
    return mobileJson({
      success: true,
      data: {
        coins: user.coinBalance.toString(),
        diamondExchange: { enabled: settings.enabled && user.diamondExchangeEnabled, diamondsPerCoin: settings.diamondsPerCoin.toString(), minDiamonds: settings.minDiamonds.toString() },
        canTransferCoins: user.appRoles.includes("RESELLER"),
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
