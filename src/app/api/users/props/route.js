import { prisma } from "../../../../lib/prisma.js";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "../../../../lib/mobile-api.js";
import {
  equippablePropCategories,
  mobileAssetUrl,
  syncProgressionProps,
} from "../../../../lib/props-store.js";

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
      select: { id: true, publicId: true, sessionVersion: true },
    });
    const now = new Date();
    const ownerships = await prisma.uploadAssetAssignment.findMany({
      where: {
        userId: user.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        asset: {
          active: true,
          category: { in: [...equippablePropCategories] },
        },
      },
      include: { asset: true },
      orderBy: { assignedAt: "desc" },
    });
    const validAssetIds = ownerships.map((item) => item.assetId);
    await prisma.userEquippedProp.deleteMany({
      where: {
        userId: user.id,
        ...(validAssetIds.length
          ? { assetId: { notIn: validAssetIds } }
          : {}),
      },
    });
    if (!validAssetIds.length)
      await prisma.userEquippedProp.deleteMany({ where: { userId: user.id } });
    const equipped = await prisma.userEquippedProp.findMany({
      where: { userId: user.id },
      select: { category: true, assetId: true },
    });
    const equippedByCategory = new Map(
      equipped.map((item) => [item.category, item.assetId]),
    );
    return mobileJson({
      success: true,
      data: {
        props: ownerships.map((ownership) => ({
          id: ownership.asset.publicId,
          name: ownership.asset.name,
          details: ownership.asset.details,
          category: ownership.asset.category,
          mimeType: ownership.asset.mimeType,
          url: mobileAssetUrl(request, ownership.asset, user),
          posterUrl: ownership.asset.posterFileData ? `${mobileAssetUrl(request, ownership.asset, user)}&poster=1` : null,
          posterMimeType: ownership.asset.posterMimeType ?? null,
          source: ownership.source,
          acquiredAt: ownership.assignedAt.toISOString(),
          expiresAt: ownership.expiresAt?.toISOString() ?? null,
          permanent: ownership.expiresAt === null,
          equipped:
            equippedByCategory.get(ownership.asset.category) ===
            ownership.assetId,
        })),
        equipped: Object.fromEntries(
          ownerships
            .filter(
              (ownership) =>
                equippedByCategory.get(ownership.asset.category) ===
                ownership.assetId,
            )
            .map((ownership) => [
              ownership.asset.category,
              {
                assetId: ownership.asset.publicId,
                url: mobileAssetUrl(request, ownership.asset, user),
                posterUrl: ownership.asset.posterFileData ? `${mobileAssetUrl(request, ownership.asset, user)}&poster=1` : null,
                mimeType: ownership.asset.mimeType,
              },
            ]),
        ),
      },
    });
  } catch (error) {
    console.error("My Props failed", error);
    return mobileApiError(error, "MY_PROPS_FAILED");
  }
}
