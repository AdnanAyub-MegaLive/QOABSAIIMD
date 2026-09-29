import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { serializeCatalogTrack } from "@/lib/music-catalog";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/user-perks";
import { musicTrackMimeTypes } from "@/lib/upload-assets";

export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request) {
  try {
    await requireMobileUser(request);
    const assets = await prisma.uploadAsset.findMany({
      where: { category: "MUSIC_TRACKS", active: true, isGlobal: true, mimeType: { in: [...musicTrackMimeTypes] } },
      select: { publicId: true, name: true, details: true, mimeType: true, updatedAt: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { publicId: "asc" }],
      take: 500,
    });
    const tracks = assets.map((asset) => serializeCatalogTrack(asset, requestOrigin(request)));
    return mobileJson({ success: true, data: { tracks } });
  } catch (error) {
    return mobileApiError(error, "MUSIC_CATALOG_FAILED");
  }
}
