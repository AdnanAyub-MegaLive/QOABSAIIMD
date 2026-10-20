import { decorationMedia, namedDecoration } from "./decoration-media.js";

export function memberArtwork(perks) {
  return Object.fromEntries(["frame", "badge"].flatMap(prefix =>
    Object.keys(namedDecoration(prefix, null)).map(key => [key, perks?.[key] ?? null])));
}

// One query for the whole group, including entitlement validation.
export async function groupMemberArtwork(db, participants, origin) {
  const userIds = [...new Set(participants.map(p => p.user.id))];
  const result = new Map();
  if (!userIds.length) return result;
  const now = new Date();
  const equipped = await db.userEquippedProp.findMany({
    where: { userId: { in: userIds }, category: { in: ["FRAMES", "BADGES"] }, asset: { active: true } },
    select: {
      userId: true, category: true,
      asset: { select: {
        publicId: true, category: true, mimeType: true, mediaVersion: true,
        posterMimeType: true, posterMediaVersion: true, isGlobal: true,
        assignments: { where: { userId: { in: userIds }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { userId: true } },
      } },
    },
  });
  for (const item of equipped) {
    if (item.asset.category !== item.category || (!item.asset.isGlobal && !item.asset.assignments.some(a => a.userId === item.userId))) continue;
    const user = participants.find(p => p.user.id === item.userId)?.user;
    if (!user) continue;
    const fields = result.get(user.publicId) ?? memberArtwork(null);
    Object.assign(fields, namedDecoration(item.category === "FRAMES" ? "frame" : "badge", decorationMedia(item.asset, origin)));
    result.set(user.publicId, fields);
  }
  return result;
}
