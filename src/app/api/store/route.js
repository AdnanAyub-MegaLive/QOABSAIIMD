import { prisma } from "../../../lib/prisma.js";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "../../../lib/mobile-api.js";
import {
  mobileAssetUrl,
  storeAssetPayload,
  syncProgressionProps,
} from "../../../lib/props-store.js";
import { validUploadCategories } from "../../../lib/upload-assets.js";

export const dynamic = "force-dynamic";
export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request) {
  try {
    const sessionUser = await requireMobileUser(request);
    await syncProgressionProps(sessionUser.id);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: sessionUser.id },
      select: {
        id: true,
        publicId: true,
        sessionVersion: true,
        coinBalance: true,
        vipLevel: true,
        totalTopUp: true,
      },
    });
    const url = new URL(request.url);
    const category = url.searchParams.get("category")?.trim().toUpperCase();
    if (category && !validUploadCategories.has(category)) {
      const error = new Error("Store category is invalid.");
      error.code = "VALIDATION_ERROR";
      throw error;
    }
    const now = new Date();
    const assets = await prisma.uploadAsset.findMany({
      where: {
        active: true,
        storeVisible: true,
        category: category || { not: "BANNERS" },
      },
      include: {
        assignments: {
          where: {
            userId: user.id,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          take: 1,
        },
        equippedBy: { where: { userId: user.id }, take: 1 },
      },
      orderBy: [{ category: "asc" }, { createdAt: "desc" }],
      take: 500,
    });
    return mobileJson({
      success: true,
      data: {
        balance: user.coinBalance.toString(),
        vipLevel: user.vipLevel,
        totalRecharge: user.totalTopUp.toString(),
        assets: assets.map((asset) =>
          storeAssetPayload(
            {
              ...asset,
              url: mobileAssetUrl(request, asset, user),
            },
            user,
            asset.assignments[0],
            asset.equippedBy[0],
          ),
        ),
      },
    });
  } catch (error) {
    console.error("Store catalog failed", error);
    return mobileApiError(error, "STORE_CATALOG_FAILED");
  }
}
