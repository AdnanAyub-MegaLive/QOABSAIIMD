import {hostWithdrawalPolicy} from "@/lib/host-salary";
import { withdrawalAvailability, payoutConfiguration } from "@/lib/withdrawal-contract";
import { walletEligibility } from "@/lib/wallet-eligibility";
import { resellerDiamondBalances } from "@/lib/reseller-redemption";
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
        publicId:true,
        status: true,
        country: true,
        deletedAt: true,
        coinBalance: true,
        walletRevision: true,
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
    let policy=await currencyPolicy(prisma);
    let hostReason=null;
    try { policy=await hostWithdrawalPolicy(prisma,user,policy); }
    catch(error){ if(error.code!=="HOST_SALARY_LEVEL_REQUIRED")throw error;hostReason={code:error.code,message:error.message}; }

    const withdrawal = withdrawalAvailability(user, policy);
    if(hostReason)Object.assign(withdrawal,{canWithdraw:false,reason:hostReason});
    const reseller = user.role === "RESELLER" || user.appRoles.includes("RESELLER");
    const sources = reseller ? await resellerDiamondBalances(prisma, user.id) : { gift: 0n, transferred: 0n };
    const eligibleDiamonds = sources.transferred < user.hostSalaryCoinBalance ? sources.transferred : user.hostSalaryCoinBalance;
    const remaining = user.hostSalaryCoinBalance - eligibleDiamonds;
    const giftDiamonds = sources.gift < remaining ? sources.gift : remaining;
    const transferRules=diamondRules(policy,user,"TRANSFER");
    if(hostReason)Object.assign(transferRules,{enabled:false,reason:hostReason.message});
    const escrowConfigured=/^[a-fA-F0-9]{64}$/.test(process.env.PAYOUT_BANK_ENCRYPTION_KEY??"")&&payoutConfiguration(policy);
    return mobileJson({
      success: true,
      data: {
        walletRevision: user.walletRevision.toString(),
        serverTime: new Date().toISOString(),
        balances: { coins: String(user.coinBalance), diamonds: String(user.hostSalaryCoinBalance), businessCoins: String(user.resellerCoinBalance), coupons: String(user.couponBalance) },
        coins: user.coinBalance.toString(),
        ...(reseller ? { giftDiamonds: String(giftDiamonds), transferredDiamonds: String(eligibleDiamonds) } : {}),
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
