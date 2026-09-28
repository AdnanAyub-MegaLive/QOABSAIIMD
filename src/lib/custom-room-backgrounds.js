import { prisma } from "./prisma.js";

export async function getCustomBackgroundConfiguration({ includeInactive = false } = {}) {
  const [settings, prices] = await Promise.all([
    prisma.customRoomBackgroundSettings.upsert({ where: { id: "DEFAULT" }, create: { id: "DEFAULT" }, update: {} }),
    prisma.customRoomBackgroundPrice.findMany({ where: includeInactive ? {} : { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
  ]);
  return {
    settings: { enabled: settings.enabled, maxBytes: settings.maxBytes, mimeTypes: settings.allowedMimeTypes, updatedAt: settings.updatedAt.toISOString() },
    prices: prices.map((price) => ({ id: price.id, name: price.name, durationDays: price.durationDays, coins: price.coins.toString(), sortOrder: price.sortOrder, active: price.active })),
  };
}

export function serializeCustomBackgroundRequest(item, origin) {
  const assignment = item.approvedAsset?.assignments?.[0];
  const expired = item.status === "APPROVED" && assignment?.expiresAt && assignment.expiresAt <= new Date();
  return {
    id: item.publicId,
    status: expired ? "EXPIRED" : item.status,
    previewUrl: `${origin}/api/room-backgrounds/custom/${item.publicId}/preview`,
    submittedAt: item.submittedAt.toISOString(),
    reviewedAt: item.reviewedAt?.toISOString() ?? null,
    durationDays: item.durationDays,
    coins: item.coins.toString(),
    priceName: item.priceName,
    mimeType: item.mimeType,
    rejectionReason: item.rejectionReason ?? null,
    assetId: item.approvedAsset?.publicId ?? null,
    expiresAt: assignment?.expiresAt?.toISOString() ?? null,
  };
}

export function customBackgroundInclude(userId) {
  return { approvedAsset: { select: { publicId: true, assignments: { where: { userId }, select: { expiresAt: true } } } } };
}
