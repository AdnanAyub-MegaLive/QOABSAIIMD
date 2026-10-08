import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { requestOrigin, resolveUserPerks } from "@/lib/user-perks";
import { avatarDisplayUrl } from "@/lib/avatar-history";
import { normalizeSignupCountry } from "@/lib/geo-country";
import { profileAccess, profileExtras, recordProfileVisit, publicAge, wallCursor } from "@/lib/public-profile";
import { isRateLimited } from "@/lib/rate-limit";

export function OPTIONS() { return mobileOptions(); }
export async function GET(request, { params }) {
  try {
    const viewer = await requireMobileUser(request);
    if (isRateLimited(`public-profile:${viewer.id}`, { limit: 120, windowMs: 60000 })) return mobileJson({ success: false, error: { code: "RATE_LIMITED", message: "Too many profile requests." } }, 429);
    const { publicId } = await params;
    const access = await profileAccess(viewer, publicId);
    const { target, isSelf, isFriend } = access;
    const origin = requestOrigin(request);
    const [extras, friends, followers, following, follows, followedBy, likes, visitors, album, legacyPerks] = await Promise.all([
      profileExtras(target, viewer, origin),
      prisma.friendRequest.count({ where: { status: "ACCEPTED", OR: [{ requesterId: target.id }, { addresseeId: target.id }] } }),
      prisma.userFollow.count({ where: { followedId: target.id } }),
      prisma.userFollow.count({ where: { followerId: target.id } }),
      prisma.userFollow.findUnique({ where: { followerId_followedId: { followerId: viewer.id, followedId: target.id } } }),
      prisma.userFollow.findUnique({ where: { followerId_followedId: { followerId: target.id, followedId: viewer.id } } }),
      prisma.userProfileLike.count({ where: { targetId: target.id } }),
      prisma.userProfileVisit.count({ where: { targetId: target.id } }),
      prisma.userAlbumItem.findMany({ where: { userId: target.id, status: "APPROVED" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21 }),
      resolveUserPerks([target], origin, ["BUSINESS_CARD"]),
    ]);
    after(() => recordProfileVisit(target.id, viewer.id).catch(error => console.error("Profile visit failed", error.message)));
    const visibleDob = isSelf || isFriend || target.showDateOfBirth;
    return mobileJson({ success: true, data: { user: {
      publicId: target.publicId, name: target.name, profileImage: avatarDisplayUrl(target.profileImage, origin),
      gender: target.gender, dob: visibleDob ? target.dob?.toISOString().slice(0, 10) ?? null : null,
      age: publicAge(target.dob, visibleDob), country: normalizeSignupCountry(target.country), bio: target.bio,
      isOfficial: target.isOfficial, isVerified: target.isVerified, vipLevel: target.vipLevel,
      ...extras, room: target.audioRooms[0] ?? null,
      businessCardUrl: legacyPerks.get(target.publicId)?.businessCardUrl ?? null,
      businessCardPosterUrl: legacyPerks.get(target.publicId)?.businessCardPosterUrl ?? null,
      businessCardMimeType: legacyPerks.get(target.publicId)?.businessCardMimeType ?? null,
      album: { items: album.slice(0, 20).map(row => ({ id: row.id, mediaUrl: avatarDisplayUrl(row.mediaUrl, origin), mediaType: row.mediaType, caption: row.caption, createdAt: row.createdAt })), nextCursor: album.length > 20 ? wallCursor(20) : null },
      counters: { friends, followers, following, likes, visitors, wealth: extras.progression.user.lifetimePoints, charm: extras.progression.charm.lifetimePoints },
      relationship: { isSelf, isFriend, isFollowing: Boolean(follows), followsYou: Boolean(followedBy), isBlocked: false, friendRequest: access.friendRequest },
    } } });
  } catch (error) { return mobileApiError(error, "PUBLIC_PROFILE_FAILED"); }
}
export async function POST(request, { params }) {
  try {
    const viewer = await requireMobileUser(request), { publicId } = await params;
    const { target, isSelf } = await profileAccess(viewer, publicId);
    if (isSelf) throw Object.assign(new Error("Cannot like your own profile."), { code: "VALIDATION_ERROR" });
    const liked = (await request.json())?.liked !== false;
    if (liked) await prisma.userProfileLike.upsert({ where: { targetId_userId: { targetId: target.id, userId: viewer.id } }, create: { targetId: target.id, userId: viewer.id }, update: {} });
    else await prisma.userProfileLike.deleteMany({ where: { targetId: target.id, userId: viewer.id } });
    return mobileJson({ success: true, data: { liked, count: await prisma.userProfileLike.count({ where: { targetId: target.id } }) } });
  } catch (error) { return mobileApiError(error, "PROFILE_LIKE_FAILED"); }
}
