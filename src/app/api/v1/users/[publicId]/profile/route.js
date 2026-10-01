import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { publicUserWithPerks, requestOrigin, resolveUserPerks } from "@/lib/user-perks";

export function OPTIONS() { return mobileOptions(); }

async function profileContext(request, params) {
  const viewer = await requireMobileUser(request);
  const { publicId } = await params;
  const target = await prisma.user.findUnique({ where: { publicId: decodeURIComponent(publicId) }, include: { agency: { select: { publicId: true, name: true } }, audioRooms: { where: { status: { in: ["LIVE", "IDLE"] } }, select: { roomId: true, status: true, title: true }, take: 1 } } });
  if (!target || target.deletedAt || target.status !== "ACTIVE") throw new Error("USER_NOT_FOUND");
  const blocked = await prisma.userBlock.findFirst({ where: { OR: [{ blockerId: viewer.id, blockedId: target.id }, { blockerId: target.id, blockedId: viewer.id }] } });
  if (blocked) throw Object.assign(new Error("This profile is unavailable."), { code: "PROFILE_BLOCKED" });
  const friendship = viewer.id === target.id || Boolean(await prisma.friendRequest.findFirst({ where: { status: "ACCEPTED", OR: [{ requesterId: viewer.id, addresseeId: target.id }, { requesterId: target.id, addresseeId: viewer.id }] } }));
  if (target.profilePrivate && !friendship) throw Object.assign(new Error("This profile is private."), { code: "PROFILE_PRIVATE" });
  return { viewer, target, friendship };
}

export async function GET(request, { params }) {
  try {
    const { viewer, target, friendship } = await profileContext(request, params);
    if (viewer.id !== target.id) await prisma.userProfileVisit.upsert({ where: { targetId_visitorId: { targetId: target.id, visitorId: viewer.id } }, create: { targetId: target.id, visitorId: viewer.id }, update: { visitCount: { increment: 1 } } });
    const [friends, followers, following, isFollowing, followsYou, likes, visitors, album, gifts, perks] = await Promise.all([
      prisma.friendRequest.count({ where: { status: "ACCEPTED", OR: [{ requesterId: target.id }, { addresseeId: target.id }] } }),
      prisma.userFollow.count({ where: { followedId: target.id } }), prisma.userFollow.count({ where: { followerId: target.id } }),
      prisma.userFollow.findUnique({ where: { followerId_followedId: { followerId: viewer.id, followedId: target.id } } }),
      prisma.userFollow.findUnique({ where: { followerId_followedId: { followerId: target.id, followedId: viewer.id } } }),
      prisma.userProfileLike.count({ where: { targetId: target.id } }), prisma.userProfileVisit.count({ where: { targetId: target.id } }),
      prisma.userAlbumItem.findMany({ where: { userId: target.id, status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.giftTransaction.groupBy({ by: ["giftAssetId", "giftName"], where: { recipientUserId: target.id }, _sum: { quantity: true, coinValue: true }, orderBy: { _sum: { coinValue: "desc" } }, take: 20 }),
      resolveUserPerks([target], requestOrigin(request), ["FRAMES", "BADGES", "BUSINESS_CARD"]),
    ]);
    const base = publicUserWithPerks(target, perks.get(target.publicId));
    return mobileJson({ success: true, data: { user: { ...base, bio: target.bio, country: target.country, dob: target.showDateOfBirth || friendship ? target.dob?.toISOString().slice(0, 10) ?? null : null, vipLevel: target.vipLevel, agency: target.agency, room: target.audioRooms[0] ?? null, counters: { friends, followers, following, likes, visitors }, relationship: { isSelf: viewer.id === target.id, isFriend: friendship, isFollowing: Boolean(isFollowing), followsYou: Boolean(followsYou) }, album: { items: album, nextCursor: album.length === 20 ? album[19].id : null }, giftWall: { items: gifts.map((gift) => ({ giftId: gift.giftAssetId, name: gift.giftName, quantity: gift._sum.quantity ?? 0, totalCoins: (gift._sum.coinValue ?? 0n).toString() })), nextCursor: null } } } });
  } catch (error) { return mobileApiError(error, "PUBLIC_PROFILE_FAILED"); }
}

export async function POST(request, { params }) {
  try {
    const { viewer, target } = await profileContext(request, params);
    if (viewer.id === target.id) throw Object.assign(new Error("You cannot like your own profile."), { code: "VALIDATION_ERROR" });
    const liked = (await request.json().catch(() => ({})))?.liked !== false;
    if (liked) await prisma.userProfileLike.upsert({ where: { targetId_userId: { targetId: target.id, userId: viewer.id } }, create: { targetId: target.id, userId: viewer.id }, update: {} });
    else await prisma.userProfileLike.deleteMany({ where: { targetId: target.id, userId: viewer.id } });
    return mobileJson({ success: true, data: { liked, count: await prisma.userProfileLike.count({ where: { targetId: target.id } }) } });
  } catch (error) { return mobileApiError(error, "PROFILE_LIKE_FAILED"); }
}
