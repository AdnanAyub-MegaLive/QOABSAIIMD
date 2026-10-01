import { prisma } from "../../../lib/prisma.js";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "../../../lib/mobile-api.js";
import {
  requestOrigin,
  resolveUserPerks,
} from "../../../lib/user-perks.js";
import { formatDateOnly } from "../../../lib/date-only.js";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const records = await prisma.friendRequest.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: user.id }, { addresseeId: user.id }],
      },
      include: {
        requester: {
          select: {
            id: true,
            publicId: true,
            name: true,
            profileImage: true,
            gender: true,
            dob: true,
            isVerified: true,
            isOfficial: true,
            appRoles: true,
            deletedAt: true,
          },
        },
        addressee: {
          select: {
            id: true,
            publicId: true,
            name: true,
            profileImage: true,
            gender: true,
            dob: true,
            isVerified: true,
            isOfficial: true,
            appRoles: true,
            deletedAt: true,
          },
        },
      },
      orderBy: { respondedAt: "desc" },
      take: 500,
    });
    const friends = records
      .map((record) =>
        record.requesterId === user.id ? record.addressee : record.requester,
      )
      .filter((friend) => !friend.deletedAt);
    const perks = await resolveUserPerks(
      friends,
      requestOrigin(request),
      ["FRAMES", "BADGES"],
    );
    return mobileJson({
      success: true,
      data: {
        friends: friends.map((friend) => ({
          id: friend.publicId,
          publicId: friend.publicId,
          name: friend.name,
          profileImage: friend.profileImage,
          gender: friend.gender ?? null,
          dob: formatDateOnly(friend.dob),
          isVerified: Boolean(friend.isVerified),
          isOfficial: Boolean(friend.isOfficial),
          roles: friend.appRoles,
          frameUrl: perks.get(friend.publicId)?.frameUrl ?? null,
          badgeUrl: perks.get(friend.publicId)?.badgeUrl ?? null,
        })),
      },
    });
  } catch (error) {
    console.error("Friend list failed", error);
    return mobileApiError(error, "FRIENDS_LIST_FAILED");
  }
}
