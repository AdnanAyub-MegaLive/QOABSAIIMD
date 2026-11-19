import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError } from "@/lib/mobile-api";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
import { requestOrigin } from "@/lib/user-perks";
import { createPublicDisplayAssetUrl } from "@/lib/upload-assets";
import { activityProgress } from "@/lib/activity-levels";
import { levelTagBackgrounds, levelMediaOrigin, tagBackground } from "@/lib/level-tag-backgrounds";

const methods = "GET, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }

export async function GET(request, { params }) {
  const { track: raw } = await params;
  return withV1Request(request, { path: "/api/v1/activity-levels/[track]", methods, rateLimit: { limit: 60, windowMs: 60000 } }, async () => {
    try {
      const track = String(raw ?? "").toUpperCase();
      if (track !== "GAME") return mobileJson({ success: false, error: { code: "VALIDATION_ERROR", message: "track must be GAME." } }, 422);
      const user = await requireMobileUser(request);
      const origin = requestOrigin(request);
      const media = levelMediaOrigin(origin);
      const rule = await prisma.activityLevelRule.findUnique({ where: { track } });
      const rows = Array.isArray(rule?.levels) ? [...rule.levels].sort((a, b) => a.level - b.level) : [];
      const badgeIds = [...new Set(rows.map((l) => l.badgeAssetId).filter(Boolean))];
      const badges = badgeIds.length ? await prisma.uploadAsset.findMany({ where: { publicId: { in: badgeIds }, active: true }, select: { publicId: true, mimeType: true, mediaVersion: true } }) : [];
      const badgeById = new Map(badges.map((b) => [b.publicId, b]));
      const backgrounds = await levelTagBackgrounds(prisma, origin, rows.map((l) => ({ track, level: l.level })));
      const levels = rows.map((l) => {
        const badge = l.badgeAssetId ? badgeById.get(l.badgeAssetId) : null;
        let badgeUrl = null;
        try { badgeUrl = badge && media ? createPublicDisplayAssetUrl(media, badge) : null; } catch { badgeUrl = null; }
        const bg = tagBackground(backgrounds, track, l.level);
        return { level: l.level, threshold: String(l.threshold), badgeUrl, badgeMimeType: badge?.mimeType ?? null, backgroundUrl: bg.backgroundUrl ?? null, backgroundMimeType: bg.backgroundMimeType ?? null };
      });
      const progress = await activityProgress(track, user.id, origin);
      const current = levels.find((l) => l.level === (progress.level ?? 0)) ?? null;
      return mobileJson({ success: true, data: { track, enabled: Boolean(rule?.enabled), levels, progress: { level: progress.level ?? 0, lifetimeXp: progress.lifetimeXp, nextLevel: progress.nextLevel, nextThreshold: progress.nextThreshold, remainingXp: progress.remainingXp, progressPercent: progress.progressPercent ?? 0, badgeUrl: current?.badgeUrl ?? null, badgeMimeType: current?.badgeMimeType ?? null, backgroundUrl: progress.backgroundUrl ?? null, backgroundMimeType: progress.backgroundMimeType ?? null } } });
    } catch (error) {
      return mobileApiError(error, "ACTIVITY_LEVELS_FAILED");
    }
  });
}
