import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { serializePackage, WALLET_CURRENCY } from "@/lib/wallet";

export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request) {
  try {
    await requireMobileUser(request);
    const packages = await prisma.walletCoinPackage.findMany({
      where: { active: true, currency: WALLET_CURRENCY },
      orderBy: [{ sortOrder: "asc" }, { coins: "asc" }],
    });
    return mobileJson({
      success: true,
      data: { currency: WALLET_CURRENCY, packages: packages.map(serializePackage) },
    });
  } catch (error) {
    console.error("Coin package catalog failed", error);
    return mobileApiError(error, "COIN_PACKAGES_FAILED");
  }
}
