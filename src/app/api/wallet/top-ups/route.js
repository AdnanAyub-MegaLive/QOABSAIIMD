import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { packageAmounts, walletPublicId } from "@/lib/wallet";

const paymentMethods = new Set(["jazzcash", "easypaisa", "card", "bank_transfer"]);

export function OPTIONS() {
  return mobileOptions();
}

export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    const body = await request.json();
    const packageId = String(body?.packageId ?? "").trim();
    const paymentMethod = String(body?.paymentMethod ?? "").trim().toLowerCase();
    if (!paymentMethods.has(paymentMethod)) throw new Error("PAYMENT_METHOD_NOT_SUPPORTED");
    const checkoutBase = String(process.env.PAYMENT_CHECKOUT_BASE_URL ?? "").trim();
    if (!checkoutBase) throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
    const coinPackage = await prisma.walletCoinPackage.findFirst({
      where: { id: packageId, active: true },
    });
    if (!coinPackage) throw new Error("COIN_PACKAGE_NOT_FOUND");
    const { bonusCoins, totalCoins } = packageAmounts(coinPackage);
    const publicId = walletPublicId("TOPUP");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const order = await prisma.walletTopUpOrder.create({
      data: {
        publicId,
        userId: user.id,
        packageId: coinPackage.id,
        paymentMethod,
        amount: coinPackage.price,
        currency: coinPackage.currency,
        baseCoins: coinPackage.coins,
        bonusCoins,
        totalCoins,
        expiresAt,
      },
    });
    const paymentUrl = new URL(checkoutBase);
    paymentUrl.searchParams.set("orderId", order.publicId);
    paymentUrl.searchParams.set("amount", order.amount.toString());
    paymentUrl.searchParams.set("currency", order.currency);
    paymentUrl.searchParams.set("method", order.paymentMethod);
    return mobileJson(
      {
        success: true,
        data: {
          orderId: order.publicId,
          status: order.status,
          amount: order.amount.toString(),
          currency: order.currency,
          paymentMethod: order.paymentMethod,
          paymentUrl: paymentUrl.toString(),
          expiresAt: order.expiresAt.toISOString(),
        },
      },
      201,
    );
  } catch (error) {
    console.error("Wallet top-up creation failed", error);
    return mobileApiError(error, "TOP_UP_FAILED");
  }
}
