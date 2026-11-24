import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { requestOrigin } from "@/lib/user-perks";
import { serializeVideoLive } from "@/lib/video-live";
import { requireVideoAccess, videoVisibility } from "@/lib/video-access";
import { resolveUserPerks } from "@/lib/user-perks";

export function OPTIONS() { return mobileOptions(); }

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const liveId = new URL(request.url).searchParams.get("liveId");
    const rows = await prisma.videoLiveSession.findMany({
      where: { ...videoVisibility(user.id), status: "LIVE", hostLastSeenAt: { gt: new Date(Date.now() - 90000) } },
      include: { host: true },
      orderBy: [{ likeCount: "desc" }, { giftIncome: "desc" }, { startedAt: "asc" }],
      take: 100,
    });
    const allowed = [];
    for (const row of rows) {
      try { await requireVideoAccess(prisma, row, user.id); allowed.push(row); } catch (e) { if (e.status !== 403) throw e; }
    }
    const origin = requestOrigin(request);
    const shown = allowed.slice(0, 50);
    const perkMap = await resolveUserPerks(shown.map((row) => row.host), origin, ["FRAMES", "BADGES"]).catch(() => new Map());
    const top = await Promise.all(shown.map(async (row, index) => ({ rank: index + 1, likeCount: row.likeCount, giftIncome: row.giftIncome.toString(), session: await serializeVideoLive(row, origin, perkMap) })));
    const position = liveId ? allowed.findIndex((row) => row.publicId === liveId) : -1;
    return mobileJson({ success: true, data: { myRank: position >= 0 ? position + 1 : null, lives: top } });
  } catch (e) {
    return mobileApiError(e, "LIVE_RANKING_FAILED");
  }
}
