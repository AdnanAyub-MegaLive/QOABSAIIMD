import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from "@/lib/mobile-api";
import { createPublicDisplayAssetUrl } from "@/lib/upload-assets";
import { requestOrigin } from "@/lib/user-perks";
export function OPTIONS() { return mobileOptions(); }
export async function GET(request) {
  try {
    await requireMobileUser(request);
    const rows = await prisma.uploadAsset.findMany({ where: { category: "LIVE_GIFTS", active: true, coinPrice: { gt: 0n } }, select: { publicId: true, name: true, mimeType: true, coinPrice: true }, orderBy: [{ sortOrder: "asc" }, { publicId: "asc" }] });
    return mobileJson({ success: true, data: { gifts: rows.map(g => ({ id: g.publicId, publicId: g.publicId, name: g.name, category: "CLASSIC", mimeType: g.mimeType, coinPrice: String(g.coinPrice), mediaUrl: createPublicDisplayAssetUrl(requestOrigin(request), g.publicId) })) } });
  } catch (e) { return mobileApiError(e, "LIVE_GIFT_CATALOG_FAILED"); }
}
