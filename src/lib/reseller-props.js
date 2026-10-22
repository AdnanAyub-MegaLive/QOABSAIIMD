import { ROLE_DISTRIBUTIONS, roleDistribution } from "./role-artwork.js";
// Preserve purchases/manual grants and revoke only role-derived entitlements.
export async function syncResellerProps(userId, client) {
  const user = await client.user.findUnique({ where: { id: userId }, select: { appRoles: true, deletedAt: true } });
  const distributions = user && !user.deletedAt ? user.appRoles.map(roleDistribution) : [];
  const eligible = distributions.length ? await client.uploadAsset.findMany({
    where: { active: true, distribution: { in: distributions } },
    select: { id: true, distribution: true, defaultGrantDurationMinutes: true, archivedAt: true },
  }) : [];
  for (const source of ROLE_DISTRIBUTIONS) {
    await client.uploadAssetAssignment.deleteMany({
      where: { userId, source, assetId: { notIn: eligible.filter(a => a.distribution === source).map(a => a.id) } },
    });
  }
  const now = new Date();
  for (const asset of eligible) {
    // Keep existing role entitlements, but do not grant archived artwork anew.
    if (asset.archivedAt) continue;
    const durationMinutes = asset.defaultGrantDurationMinutes;
    await client.uploadAssetAssignment.upsert({
      where: { assetId_userId: { assetId: asset.id, userId } }, update: {},
      create: {
        assetId: asset.id, userId, source: asset.distribution, sourceReference: asset.distribution === "RESELLER" ? "ROLE_RESELLER" : asset.distribution,
        assignedAt: now, durationMinutes,
        expiresAt: durationMinutes ? new Date(now.getTime() + durationMinutes * 60000) : null,
      },
    });
  }
}

