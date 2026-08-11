import { prisma } from "../../../../../lib/prisma.js";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "../../../../../lib/mobile-api.js";
import { entitlementExpiry } from "../../../../../lib/props-store.js";
import { ledgerData } from "../../../../../lib/wallet.js";

export function OPTIONS() {
  return mobileOptions();
}

export async function POST(request, { params }) {
  try {
    const user = await requireMobileUser(request);
    const { assetId } = await params;
    const result = await prisma.$transaction(
      async (tx) => {
        const asset = await tx.uploadAsset.findFirst({
          where: {
            publicId: assetId,
            active: true,
            storeVisible: true,
            distribution: "STORE",
          },
        });
        if (!asset) throw new Error("STORE_ITEM_NOT_FOUND");
        const now = new Date();
        const existing = await tx.uploadAssetAssignment.findUnique({
          where: { assetId_userId: { assetId: asset.id, userId: user.id } },
        });
        if (
          existing &&
          (!existing.expiresAt || existing.expiresAt > now)
        )
          throw new Error("PROP_ALREADY_OWNED");
        const price = asset.coinPrice ?? 0n;
        const debited = await tx.user.updateMany({
          where: { id: user.id, coinBalance: { gte: price } },
          data: {
            coinBalance: { decrement: price },
            totalSpent: { increment: price },
          },
        });
        if (!debited.count) throw new Error("INSUFFICIENT_COINS");
        const purchaseId = `PUR-${crypto
          .randomUUID()
          .replaceAll("-", "")
          .slice(0, 16)
          .toUpperCase()}`;
        const expiresAt = entitlementExpiry(asset, now);
        await tx.uploadAssetAssignment.upsert({
          where: { assetId_userId: { assetId: asset.id, userId: user.id } },
          update: {
            assignedAt: now,
            durationMinutes: asset.defaultGrantDurationMinutes,
            expiresAt,
            source: "STORE",
            sourceReference: purchaseId,
            purchasePrice: price,
          },
          create: {
            assetId: asset.id,
            userId: user.id,
            durationMinutes: asset.defaultGrantDurationMinutes,
            expiresAt,
            source: "STORE",
            sourceReference: purchaseId,
            purchasePrice: price,
          },
        });
        await tx.propPurchase.create({
          data: {
            publicId: purchaseId,
            userId: user.id,
            assetId: asset.id,
            assetPublicId: asset.publicId,
            assetName: asset.name,
            price,
          },
        });
        await tx.walletTransaction.create({
          data: ledgerData({
            userId: user.id,
            type: "STORE_PURCHASE",
            direction: "DEBIT",
            title: "Store purchase",
            description: asset.name,
            coins: price,
            referenceId: purchaseId,
            metadata: { assetId: asset.publicId },
          }),
        });
        const updated = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { coinBalance: true },
        });
        return { asset, purchaseId, price, expiresAt, balance: updated.coinBalance };
      },
      { isolationLevel: "Serializable" },
    );
    return mobileJson({
      success: true,
      data: {
        purchaseId: result.purchaseId,
        assetId: result.asset.publicId,
        price: result.price.toString(),
        balance: result.balance.toString(),
        expiresAt: result.expiresAt?.toISOString() ?? null,
        permanent: result.expiresAt === null,
      },
    });
  } catch (error) {
    console.error("Store purchase failed", error);
    return mobileApiError(error, "STORE_PURCHASE_FAILED");
  }
}
