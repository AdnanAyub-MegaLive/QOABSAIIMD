import { GIFT_CATEGORIES, giftCategory } from "@/lib/gift-categories";
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
import { giftCatalogVersion } from "@/lib/gift-catalog-version";

const tiers = ["CLASSIC", "PREMIUM", "VIP", "LUCKY", "BLIND_BOX"];

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
        giftCategory: true,
        mimeType: true,
        mediaVersion:true,
        posterMediaVersion:true,
        posterMimeType:true,
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
      category: giftCategory(asset.giftCategory, asset.giftTier),
      giftTier: asset.giftTier,
      mimeType: asset.mimeType,
      coinPrice: asset.coinPrice.toString(),
      mediaUrl: createPublicDisplayAssetUrl(origin, asset),
      mediaVersion:asset.mediaVersion,
      posterMediaVersion:asset.posterMediaVersion,
      posterMimeType:asset.posterMimeType,
      posterUrl:asset.posterMimeType?`${createPublicDisplayAssetUrl(origin,asset.publicId,3600,asset.posterMediaVersion)}&poster=1`:null,
    }));

    return mobileJson({
      success: true,
      data: {
        catalogVersion:await giftCatalogVersion(),
        categories: GIFT_CATEGORIES.map(([id, name]) => ({
          id,
          name,
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
