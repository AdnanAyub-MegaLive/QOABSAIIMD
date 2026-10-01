import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";
import {
  createPublicDisplayAssetUrl,
} from "@/lib/upload-assets";
import { requestOrigin } from "@/lib/user-perks";

const tiers = ["CLASSIC", "PREMIUM", "VIP"];

export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request) {
  try {
    await requireMobileUser(request);
    const assets = await prisma.uploadAsset.findMany({
      where: {
        category: "GIFTS",
        active: true,
        giftTier: { in: tiers },
        coinPrice: { gt: 0n },
      },
      select: {
        publicId: true,
        name: true,
        details: true,
        tags: true,
        giftTier: true,
        mimeType: true,
        coinPrice: true,
        createdAt: true,
      },
      orderBy: [{ coinPrice: "asc" }, { createdAt: "desc" }],
      take: 500,
    });
    const origin = requestOrigin(request);
    const gifts = assets.map((asset) => ({
      id: asset.publicId,
      name: asset.name,
      details: asset.details,
      tags: asset.tags,
      category: asset.giftTier,
      mimeType: asset.mimeType,
      coinPrice: asset.coinPrice.toString(),
      mediaUrl: createPublicDisplayAssetUrl(origin, asset.publicId),
    }));

    return mobileJson({
      success: true,
      data: {
        categories: tiers.map((id) => ({
          id,
          name: id.charAt(0) + id.slice(1).toLowerCase(),
          gifts: gifts.filter((gift) => gift.category === id),
        })),
        gifts,
      },
    });
  } catch (error) {
    console.error("Gift catalog failed", error);
    return mobileApiError(error, "GIFT_CATALOG_FAILED");
  }
}
