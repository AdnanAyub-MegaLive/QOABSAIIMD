import { withdrawalAvailability } from "@/lib/withdrawal-contract";
import { prisma } from "@/lib/prisma";
import { exchangeSettings } from "@/lib/diamond-exchange";
import { currencyPolicy } from "@/lib/currency-policy";
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
        status: true,
        deletedAt: true,
        coinBalance: true,
        diamondExchangeEnabled: true,
        appRoles: true,
        role: true,
        agencyId: true,
        hostSalaryCoinBalance: true,
        couponBalance: true,
        totalTopUp: true,
        updatedAt: true,
      },
    });
    const settings = await exchangeSettings(prisma,user);
    const policy=await currencyPolicy(prisma);
    const withdrawal = withdrawalAvailability(user, policy);
    return mobileJson({
      success: true,
      data: {
        coins: user.coinBalance.toString(),
        currencyPolicy: policy,
        canWithdraw: withdrawal.canWithdraw,
        withdrawal,
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
