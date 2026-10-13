import { prisma } from "./prisma.js";
import { requireMobileUser, mobileJson, mobileApiError } from "./mobile-api.js";
import { requestOrigin } from "./user-perks.js";
import { avatarDisplayUrl } from "./avatar-history.js";
import { profileVisitBoundary, profileVisitCursor, profileVisitMetadata } from "./profile-visit-page.js";
import { profileAccess, equippedProfileAssets, publicPerson, activePerson, wallCursor, wallOffset } from "./public-profile.js";
export async function profileSocialList(request, params, type) {
  try {
    const viewer = await requireMobileUser(request), { publicId } = await params;
    const { target, isSelf } = await profileAccess(viewer, publicId);
    // Visitor identities are private analytics, not public-profile counters.
    if (type === "visitors" && !isSelf) return mobileJson({ success: false, error: { code: "FORBIDDEN", message: "Only the profile owner can read visitors." } }, 403);
    const query = new URL(request.url).searchParams, offset = type === "visitors" ? 0 : wallOffset(query.get("cursor")), limit = Number(query.get("limit") ?? 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("VALIDATION_ERROR");
    const blocks = await prisma.userBlock.findMany({ where: { OR: [{ blockerId: viewer.id }, { blockedId: viewer.id }] }, select: { blockerId: true, blockedId: true } });
    const visible = { ...activePerson, id: { notIn: blocks.map(b => b.blockerId === viewer.id ? b.blockedId : b.blockerId) } };
    let rows, visits;
    if (type === "visitors") {
      visits = await prisma.userProfileVisit.findMany({ where: { targetId: target.id, visitor: visible, ...profileVisitBoundary(query.get("cursor")) }, include: { visitor: { select: publicPerson } }, orderBy: [{ lastVisitedAt: "desc" }, { visitorId: "asc" }], take: limit + 1 });
      rows = visits.map(r => ({ ...r.visitor, ...profileVisitMetadata(r) }));
    }
    else {
      const followers = type === "followers", relation = followers ? "follower" : "followed";
      rows = (await prisma.userFollow.findMany({ where: { [followers ? "followedId" : "followerId"]: target.id, [relation]: visible }, include: { [relation]: { select: publicPerson } }, orderBy: [{ createdAt: "desc" }, { followerId: "asc" }, { followedId: "asc" }], skip: offset, take: limit + 1 })).map(r => r[relation]);
    }
    const origin = requestOrigin(request), page = rows.slice(0, limit);
    const [equipment, follows] = await Promise.all([equippedProfileAssets(page, origin), prisma.userFollow.findMany({ where: { followerId: viewer.id, followedId: { in: page.map(p => p.id) } }, select: { followedId: true } })]);
    return mobileJson({ success: true, data: { items: page.map(p => ({ publicId: p.publicId, name: p.name, profileImage: avatarDisplayUrl(p.profileImage, origin), frameUrl: equipment.get(p.id)?.avatarFrame?.url ?? null, badgeUrl: equipment.get(p.id)?.profileBadge?.url ?? null, isOfficial: p.isOfficial, isFollowing: follows.some(f => f.followedId === p.id), ...(type === "visitors" ? { firstVisitedAt: p.firstVisitedAt, lastVisitedAt: p.lastVisitedAt, visitCount: p.visitCount, artwork: equipment.get(p.id) ?? null } : {}) })), nextCursor: rows.length > limit ? (type === "visitors" ? profileVisitCursor(visits[limit - 1]) : wallCursor(offset + limit)) : null } });
  } catch (error) { return mobileApiError(error, "PROFILE_SOCIAL_FAILED"); }
}
