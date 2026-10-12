import { prisma } from "./prisma.js";
import { roleDistribution } from "./role-artwork.js";
import { APPLICATION_ROLES, displayApplicationRole } from "./user-roles.js";
import { createPublicDisplayAssetUrl } from "./upload-assets.js";

// Role tags are authoritative identity artwork, independent of equipped store badges.
export async function resolveRoleTags(users, origin, db = prisma) {
  const distributions = [...new Set(users.flatMap(u => (u.appRoles ?? []).map(roleDistribution)))];
  const assets = distributions.length ? await db.uploadAsset.findMany({
    where: { active: true, category: { in: ["USER_TAGS", "BADGES"] }, distribution: { in: distributions } },
    orderBy: [{ updatedAt: "desc" }, { publicId: "asc" }],
    select: { publicId: true, distribution: true, mimeType: true, category: true },
  }) : [];
  return new Map(users.map(user => [user.publicId, APPLICATION_ROLES.filter(role => user.appRoles?.includes(role)).map(role => {
    const asset = assets.find(a => a.distribution === roleDistribution(role) && a.category === "USER_TAGS");
    const badge = assets.find(a => a.distribution === roleDistribution(role) && a.category === "BADGES");
    return { badgeAssetId: badge?.publicId ?? null, badgeUrl: badge ? createPublicDisplayAssetUrl(origin, badge.publicId) : null, badgeMimeType: badge?.mimeType ?? null, role, roleLabel: displayApplicationRole(role), assetId: asset?.publicId ?? null,
      imageUrl: asset ? createPublicDisplayAssetUrl(origin, asset.publicId) : null, mimeType: asset?.mimeType ?? null };
  })]));
}
