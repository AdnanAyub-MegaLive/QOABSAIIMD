import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { requestOrigin } from "@/lib/user-perks";
import { serializeVideoLive } from "@/lib/video-live";
import { videoVisibility } from "@/lib/video-access";
import { resolveUserPerks } from "@/lib/user-perks";

export function OPTIONS() { return mobileOptions(); }

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const liveId = new URL(request.url).searchParams.get("liveId");
    const now = new Date();
    const blocks = await prisma.userBlock.findMany({ where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] }, select: { blockerId: true, blockedId: true } });
    const blockedHosts = blocks.map((b) => (b.blockerId === user.id ? b.blockedId : b.blockerId));
    const where = { AND: [videoVisibility(user.id), { OR: [{ hostId: user.id }, { hostId: { notIn: blockedHosts }, bans: { none: { userId: user.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } }] }], status: "LIVE", hostLastSeenAt: { gt: new Date(Date.now() - 90000) } };
    const shown = await prisma.videoLiveSession.findMany({
      where,
      include: { host: true },
      orderBy: [{ likeCount: "desc" }, { giftIncome: "desc" }, { startedAt: "asc" }],
      take: 50,
    });
    const origin = requestOrigin(request);
    const perkMap = await resolveUserPerks(shown.map((row) => row.host), origin, ["FRAMES", "BADGES"]).catch(() => new Map());
    const top = await Promise.all(shown.map(async (row, index) => ({ rank: index + 1, likeCount: row.likeCount, giftIncome: row.giftIncome.toString(), session: await serializeVideoLive(row, origin, perkMap) })));
    let myRank = null;
    if (liveId) {
      const index = shown.findIndex((row) => row.publicId === liveId);
      if (index >= 0) myRank = index + 1;
      else {
        const mine = await prisma.videoLiveSession.findFirst({ where: { ...where, publicId: liveId }, select: { likeCount: true, giftIncome: true, startedAt: true } });
        if (mine) myRank = 1 + await prisma.videoLiveSession.count({ where: { ...where, OR: [{ likeCount: { gt: mine.likeCount } }, { likeCount: mine.likeCount, giftIncome: { gt: mine.giftIncome } }, { likeCount: mine.likeCount, giftIncome: mine.giftIncome, startedAt: { lt: mine.startedAt } }] } });
      }
    }
    return mobileJson({ success: true, data: { myRank, lives: top } });
  } catch (e) {
    return mobileApiError(e, "LIVE_RANKING_FAILED");
  }
}
