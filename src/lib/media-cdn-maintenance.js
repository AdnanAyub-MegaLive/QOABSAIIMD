import { canPublishMedia } from "./media-cdn-policy.js";
import { mirrorAsset } from "./media-cdn.js";

// Durable pending state is the missing CDN link itself. Scan small metadata
// pages, then load bytes only for eligible pending assets. A cursor prevents a
// permanently failing upload from starving newer uploads. No private promotion.
export function createMediaCdnMaintenance(db, mirror = mirrorAsset) {
  let cursor = null, running = false;
  return async function reconcile() {
    if (running || process.env.MEDIA_CDN_ENABLED !== "true") return;
    running = true;
    try {
      const rows = await db.uploadAsset.findMany({
        where: { active: true, OR: [{ cdnUrl: null }, { posterMimeType: { not: null }, posterCdnUrl: null }] },
        select: { id: true, category: true, mimeType: true, active: true, isGlobal: true, storeVisible: true, audioRoomId: true },
        orderBy: { id: "asc" }, take: 20,
        ...(cursor ? { where: { active: true, id: { gt: cursor }, OR: [{ cdnUrl: null }, { posterMimeType: { not: null }, posterCdnUrl: null }] } } : {}),
      });
      let attempts = 0;
      for (const row of rows) {
        cursor = row.id;
        if (!canPublishMedia(row)) continue;
        const asset = await db.uploadAsset.findUnique({ where: { id: row.id } });
        if (!asset || !canPublishMedia(asset)) continue;
        try { await mirror(db, asset); }
        catch (error) { console.error("Public CDN retry failed", asset.publicId, error.name); }
        if (++attempts >= 5) return;
      }
      if (rows.length < 20) cursor = null;
    } finally { running = false; }
  };
}
