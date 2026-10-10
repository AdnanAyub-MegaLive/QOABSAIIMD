import { prisma } from "@/lib/prisma";
import { currencyPolicy,rechargePrice } from "@/lib/currency-policy";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { serializePackage } from "@/lib/wallet";

export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request) {
  try {
    await requireMobileUser(request);
    const packages = await prisma.walletCoinPackage.findMany({
      where: { active: true, currency: "USD" },
      orderBy: [{ sortOrder: "asc" }, { coins: "asc" }],
    });
    const policy=await currencyPolicy(prisma);
    return mobileJson({
      success: true,
      data: { currency: "USD", policyVersion:policy.version, packages: packages.map(item=>({...serializePackage(item),price:rechargePrice(item.coins,policy)})) },
    });
  } catch (error) {
    console.error("Coin package catalog failed", error);
    return mobileApiError(error, "COIN_PACKAGES_FAILED");
  }
}
