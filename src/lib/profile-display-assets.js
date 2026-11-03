import { prisma } from "./prisma.js";
import { decorationMedia } from "./decoration-media.js";

export async function displayAssets(ids, origin, db = prisma) {
  const rows = ids.length ? await db.uploadAsset.findMany({ where: { publicId: { in: [...new Set(ids.filter(Boolean))] }, active: true }, select: { publicId: true, name: true, category: true, mimeType: true, posterMimeType: true, mediaVersion: true, posterMediaVersion: true } }) : [];
  return new Map(rows.map(asset => [asset.publicId, { ...decorationMedia(asset, origin), category: asset.category, name: asset.name }]));
}
export async function equippedProfileAssets(users, origin, db = prisma) {
  const now = new Date();
  const rows = await db.userEquippedProp.findMany({ where: { userId: { in: users.map(u => u.id) }, category: { in: ["FRAMES", "BADGES", "PROFILE_DRESS", "USER_TAGS", "PROFILE_BG"] }, asset: { active: true } }, include: { asset: { select: { publicId: true, isGlobal: true, mimeType: true, category: true, assignments: { where: { userId: { in: users.map(u => u.id) }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { userId: true } } } } } });
  const assets = await displayAssets(rows.map(r => r.asset.publicId), origin, db);
  const results = new Map(users.map(u => [u.id, { avatarFrame: null, profileBadge: null, profileDress: null, userTag: null, profileBackground: null }]));
  const keys = { FRAMES: "avatarFrame", BADGES: "profileBadge", PROFILE_DRESS: "profileDress", USER_TAGS: "userTag", PROFILE_BG: "profileBackground" };
  for (const row of rows) {
    if (row.asset.category !== row.category || (!row.asset.isGlobal && !row.asset.assignments.some(a => a.userId === row.userId))) continue;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "application/svga"].includes(row.asset.mimeType)) continue;
    const asset = assets.get(row.asset.publicId);
    if (asset) { const { name: _name, category: _category, ...media } = asset; results.get(row.userId)[keys[row.category]] = media; }
  }
  return results;
}
