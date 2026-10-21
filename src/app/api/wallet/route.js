import { withdrawalAvailability, payoutConfiguration } from "@/lib/withdrawal-contract";
import { walletEligibility } from "@/lib/wallet-eligibility";
import { redeemableHostDiamonds } from "@/lib/reseller-redemption";
import { prisma } from "@/lib/prisma";
import { currencyPolicy } from "@/lib/currency-policy";
import { diamondRules } from "@/lib/diamond-service-rules";
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
        id: true,
        status: true,
        country: true,
        deletedAt: true,
        coinBalance: true,
        resellerCoinBalance: true,
        diamondExchangeEnabled: true,
        appRoles: true,
        role: true,
        agencyId: true,
        ownedAgencies: { select: { status: true } },
        hostSalaryCoinBalance: true,
        couponBalance: true,
        totalTopUp: true,
        updatedAt: true,
      },
    });
    const policy=await currencyPolicy(prisma);
    const withdrawal = withdrawalAvailability(user, policy);
    const reseller = user.appRoles.includes("RESELLER");
    const eligibleDiamonds = reseller ? await redeemableHostDiamonds(prisma,user.id) : 0n;
    const transferRules=diamondRules(policy,user,"TRANSFER");
    const escrowConfigured=/^[a-fA-F0-9]{64}$/.test(process.env.PAYOUT_BANK_ENCRYPTION_KEY??"")&&payoutConfiguration(policy);
    return mobileJson({
      success: true,
      data: {
        coins: user.coinBalance.toString(),
        personalCoins: user.coinBalance.toString(),
        businessCoins: user.resellerCoinBalance.toString(),
        coinRecharge: { sourceWallet:"BUSINESS", destinationWallet:"PERSONAL", selfRechargeAllowed:reseller && walletEligibility(user).transfer, reverseTransferAllowed:false, idempotencyKeyRequired:true },
        currencyPolicy: policy,
        canWithdraw: withdrawal.canWithdraw,
        withdrawal,
        resellerRedemption: {
          enabled: reseller && walletEligibility(user).withdraw && policy.rules.redemptionEnabled === true,
          adminReviewed: true,
          hostTransfersOnly: true,
          eligibleDiamonds: String(eligibleDiamonds < user.hostSalaryCoinBalance ? eligibleDiamonds : user.hostSalaryCoinBalance),
          diamondUnits: policy.rules.redemptionDiamondsPerCoin || null,
          coinUnits: policy.rules.redemptionCoinsNumerator ?? "1",
          deductionBps: policy.rules.redemptionDeductionBps,
        },
        diamondExchange: diamondRules(policy, user, "EXCHANGE"),
        diamondTransfer: transferRules,
        resellerPayout: {enabled:transferRules.enabled&&escrowConfigured&&policy.rules.usdtEnabled===true,reason:!transferRules.enabled?transferRules.reason:!escrowConfigured?"Payout rates or private storage configuration is incomplete.":!policy.rules.usdtEnabled?"Payouts are disabled.":null,availableDiamonds:String(user.hostSalaryCoinBalance),rules:transferRules,withdrawalMinDiamonds:policy.rules.withdrawalMinDiamonds,withdrawalMaxDiamonds:policy.rules.withdrawalMaxDiamonds,paymentDayChoices:[1,3,5],defaultPaymentDays:3,verificationHours:24,endpoint:"/api/v1/wallet/reseller-payouts"},
        canTransferCoins: user.appRoles.includes("RESELLER") && walletEligibility(user).transfer,
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
