import { roleArtworkLabel } from "./role-artwork.js";
import { syncResellerProps } from "./reseller-props.js";
import { prisma } from "./prisma.js";
import { createSignedAssetUrl } from "./upload-assets.js";
import { requestOrigin } from "./user-perks.js";

export const equippablePropCategories = new Set([
  "PROFILE_DRESS",
  "USER_TAGS",
  "PROFILE_BG",
  "FRAMES",
  "ENTRANCES",
  "RIDES",
  "TAIL_LIGHTS",
  "BADGES",
  "CHAT_BOXES",
  "ROOM_FRAMES",
  "ROOM_BACKGROUNDS",
  "SEAT_STYLES",
  "BUSINESS_CARD",
]);

export function entitlementExpiry(asset, from = new Date()) {
  return asset.defaultGrantDurationMinutes
    ? new Date(from.getTime() + asset.defaultGrantDurationMinutes * 60000)
    : null;
}

export async function syncProgressionProps(userId, client = prisma) {
  if (client === prisma) return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    return syncProgressionProps(userId, tx);
  });
  await syncResellerProps(userId, client);
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { id: true, vipLevel: true, totalTopUp: true, deletedAt: true },
  });
  if (!user || user.deletedAt) return;
  const eligible = await client.uploadAsset.findMany({
    where: {
      active: true,
      archivedAt: null,
      OR: [
        {
          distribution: "VIP",
          minimumVipLevel: { not: null, lte: user.vipLevel },
        },
        {
          distribution: "SVIP",
          minimumRecharge: { not: null, lte: user.totalTopUp },
        },
      ],
    },
    select: {
      id: true,
      distribution: true,
      defaultGrantDurationMinutes: true,
    },
  });
  // Revoke only level-derived rewards, never independent purchases or grants.
  await client.uploadAssetAssignment.deleteMany({
    where: { userId: user.id, source: "VIP", asset: { distribution: "VIP", minimumVipLevel: { gt: user.vipLevel } } },
  });
  if (!eligible.length) return;
  const now = new Date();
  const existing = await client.uploadAssetAssignment.findMany({
    where: { userId: user.id, assetId: { in: eligible.map((asset) => asset.id) } },
    select: { assetId: true, expiresAt: true },
  });
  const existingByAsset = new Map(existing.map((item) => [item.assetId, item]));
  await Promise.all(
    eligible.map((asset) => {
      const current = existingByAsset.get(asset.id);
      if (current && (!current.expiresAt || current.expiresAt > now)) return null;
      const data = {
        durationMinutes: asset.defaultGrantDurationMinutes,
        assignedAt: now,
        expiresAt: entitlementExpiry(asset, now),
        source: asset.distribution,
        sourceReference:
          asset.distribution === "VIP"
            ? `VIP_LEVEL_${user.vipLevel}`
            : `TOTAL_RECHARGE_${user.totalTopUp}`,
      };
      return current
        ? client.uploadAssetAssignment.update({
            where: { assetId_userId: { assetId: asset.id, userId: user.id } },
            data,
          })
        : client.uploadAssetAssignment.upsert({
            where: { assetId_userId: { assetId: asset.id, userId: user.id } },
            update: data,
            create: { assetId: asset.id, userId: user.id, ...data },
          });
    }),
  );
}

export function activeEntitlementWhere(userId, now = new Date()) {
  return {
    userId,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

export function mobileAssetUrl(request, asset, user) {
  return createSignedAssetUrl(
    requestOrigin(request),
    asset.publicId,
    user.publicId,
    user.sessionVersion,
  );
}

export function storeAssetPayload(asset, user, entitlement, equipped) {
  const renewable = Boolean(asset.active && !asset.archivedAt && asset.storeVisible && asset.distribution === "STORE" && asset.defaultGrantDurationMinutes > 0 && entitlement?.expiresAt);
  const ownershipRecord = entitlement;
  if (entitlement?.expiresAt && entitlement.expiresAt <= new Date()) entitlement = null;
  const lockedReason = entitlement
    ? null
    : roleArtworkLabel(asset.distribution)
      ? `Requires the assigned role: ${roleArtworkLabel(asset.distribution)}.`
      : asset.distribution === "VIP"
      ? `Requires VIP ${asset.minimumVipLevel}`
      : asset.distribution === "SVIP"
        ? `Requires total recharge of ${asset.minimumRecharge ?? 0n}`
        : asset.distribution === "ACTIVITY"
          ? "Earn this item from an activity or event."
          : asset.distribution === "MANUAL"
            ? "Available through a Super Admin grant."
            : null;
  return {
    id: asset.publicId,
    name: asset.name,
    details: asset.details,
    tags: asset.tags,
    category: asset.category,
    mimeType: asset.mimeType,
    fileSize: asset.fileSize,
    url: asset.url,
    posterUrl: (asset.posterMimeType || asset.posterFileData) ? `${asset.url}&poster=1` : null,
    posterMimeType: asset.posterMimeType ?? null,
    distribution: asset.distribution,
    price: asset.coinPrice?.toString() ?? null,
    minimumVipLevel: asset.minimumVipLevel,
    minimumRecharge: asset.minimumRecharge?.toString() ?? null,
    defaultGrantDurationMinutes: asset.defaultGrantDurationMinutes,
    grantDays: asset.defaultGrantDurationMinutes > 0 ? asset.defaultGrantDurationMinutes / 1440 : null,
    renewable,
    owned: Boolean(entitlement),
    ownership: ownershipRecord
      ? {
          source: ownershipRecord.source,
          acquiredAt: ownershipRecord.assignedAt.toISOString(),
          expiresAt: ownershipRecord.expiresAt?.toISOString() ?? null,
          permanent: ownershipRecord.expiresAt === null,
        }
      : null,
    equipped: equipped?.assetId === asset.id,
    lockedReason,
    canPurchase:
      asset.distribution === "STORE" &&
      asset.storeVisible &&
      !entitlement &&
      user.coinBalance >= (asset.coinPrice ?? 0n),
  };
}
