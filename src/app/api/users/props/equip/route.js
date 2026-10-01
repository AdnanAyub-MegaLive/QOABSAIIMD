import { prisma } from "../../../../../lib/prisma.js";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "../../../../../lib/mobile-api.js";
import { equippablePropCategories } from "../../../../../lib/props-store.js";
import { emitToUser } from "../../../../../lib/realtime.js";

export function OPTIONS() {
  return mobileOptions();
}

export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    const body = await request.json();
    const assetId = body?.assetId ? String(body.assetId).trim() : null;
    const requestedCategory = body?.category
      ? String(body.category).trim().toUpperCase()
      : null;
    if (!assetId) {
      if (!requestedCategory || !equippablePropCategories.has(requestedCategory)) {
        const error = new Error("A valid category is required to remove a prop.");
        error.code = "VALIDATION_ERROR";
        throw error;
      }
      await prisma.userEquippedProp.deleteMany({
        where: { userId: user.id, category: requestedCategory },
      });
      emitToUser(user.publicId, "props:updated", {
        category: requestedCategory,
        assetId: null,
      });
      return mobileJson({
        success: true,
        data: { category: requestedCategory, assetId: null, equipped: false },
      });
    }
    const asset = await prisma.uploadAsset.findFirst({
      where: { publicId: assetId, active: true },
      select: { id: true, publicId: true, category: true },
    });
    if (!asset) throw new Error("PROP_NOT_FOUND");
    if (!equippablePropCategories.has(asset.category))
      throw new Error("PROP_NOT_EQUIPPABLE");
    const ownership = await prisma.uploadAssetAssignment.findFirst({
      where: {
        assetId: asset.id,
        userId: user.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (!ownership) throw new Error("PROP_NOT_OWNED");
    await prisma.userEquippedProp.upsert({
      where: { userId_category: { userId: user.id, category: asset.category } },
      update: { assetId: asset.id, equippedAt: new Date() },
      create: { userId: user.id, category: asset.category, assetId: asset.id },
    });
    emitToUser(user.publicId, "props:updated", {
      category: asset.category,
      assetId: asset.publicId,
    });
    return mobileJson({
      success: true,
      data: {
        category: asset.category,
        assetId: asset.publicId,
        equipped: true,
      },
    });
  } catch (error) {
    console.error("Equip prop failed", error);
    return mobileApiError(error, "PROP_EQUIP_FAILED");
  }
}
