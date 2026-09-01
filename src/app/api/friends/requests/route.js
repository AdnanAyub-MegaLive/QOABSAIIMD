import { prisma } from "../../../../lib/prisma.js";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "../../../../lib/mobile-api.js";
import {
  friendPairKey,
  friendRequestPublicId,
} from "../../../../lib/friends.js";
import { emitToUser } from "../../../../lib/realtime.js";
import {
  requestOrigin,
  resolveUserPerks,
} from "../../../../lib/user-perks.js";
import { formatDateOnly } from "../../../../lib/date-only.js";
import { assertUsersCanInteract } from "../../../../lib/user-blocks.js";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return mobileOptions();
}

function incomingPayload(record, perks) {
  return {
    id: record.publicId,
    requestId: record.publicId,
    requesterId: record.requester.publicId,
    requesterName: record.requester.name,
    requesterProfileImage: record.requester.profileImage,
    requesterGender: record.requester.gender ?? null,
    requesterDob: formatDateOnly(record.requester.dob),
    requesterIsVerified: Boolean(record.requester.isVerified),
    requesterIsOfficial: Boolean(record.requester.isOfficial),
    requesterFrameUrl: perks?.frameUrl ?? null,
    requesterBadgeUrl: perks?.badgeUrl ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const requests = await prisma.friendRequest.findMany({
      where: {
        addresseeId: user.id,
        status: "PENDING",
        requester: { deletedAt: null },
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
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const perks = await resolveUserPerks(
      requests.map((item) => item.requester),
      requestOrigin(request),
      ["FRAMES", "BADGES"],
    );
    return mobileJson({
      success: true,
      data: {
        requests: requests.map((item) =>
          incomingPayload(item, perks.get(item.requester.publicId)),
        ),
      },
    });
  } catch (error) {
    console.error("Incoming friend requests failed", error);
    return mobileApiError(error, "FRIEND_REQUESTS_FAILED");
  }
}

export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    const body = await request.json();
    const targetPublicId = String(body?.targetUserId ?? "").trim();
    if (!targetPublicId) {
      const error = new Error("targetUserId is required.");
      error.code = "VALIDATION_ERROR";
      throw error;
    }
    if (targetPublicId === user.publicId)
      throw new Error("SELF_FRIEND_REQUEST");
    const target = await prisma.user.findFirst({
      where: { publicId: targetPublicId, deletedAt: null },
      select: {
        id: true,
        publicId: true,
        name: true,
        profileImage: true,
        gender: true,
        dob: true,
        isVerified: true,
        isOfficial: true,
      },
    });
    if (!target) throw new Error("USER_NOT_FOUND");
    await assertUsersCanInteract(user.id, target.id);
    const pairKey = friendPairKey(user.id, target.id);
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.friendRequest.findUnique({
        where: { pairKey },
        include: {
          requester: {
            select: { id: true, publicId: true, name: true, profileImage: true, gender: true, dob: true, isVerified: true, isOfficial: true },
          },
          addressee: {
            select: { id: true, publicId: true, name: true, profileImage: true, gender: true, dob: true, isVerified: true, isOfficial: true },
          },
        },
      });
      if (existing?.status === "ACCEPTED") throw new Error("ALREADY_FRIENDS");
      if (existing?.status === "PENDING") {
        if (existing.requesterId === user.id)
          throw new Error("REQUEST_ALREADY_PENDING");
        return {
          autoAccepted: true,
          request: await tx.friendRequest.update({
            where: { id: existing.id },
            data: { status: "ACCEPTED", respondedAt: new Date() },
            include: {
              requester: {
                select: { id: true, publicId: true, name: true, profileImage: true, gender: true, dob: true, isVerified: true, isOfficial: true },
              },
              addressee: {
                select: { id: true, publicId: true, name: true, profileImage: true, gender: true, dob: true, isVerified: true, isOfficial: true },
              },
            },
          }),
        };
      }
      if (existing) {
        return {
          autoAccepted: false,
          request: await tx.friendRequest.update({
            where: { id: existing.id },
            data: {
              requesterId: user.id,
              addresseeId: target.id,
              status: "PENDING",
              createdAt: new Date(),
              respondedAt: null,
            },
            include: {
              requester: {
                select: { id: true, publicId: true, name: true, profileImage: true, gender: true, dob: true, isVerified: true, isOfficial: true },
              },
              addressee: {
                select: { id: true, publicId: true, name: true, profileImage: true, gender: true, dob: true, isVerified: true, isOfficial: true },
              },
            },
          }),
        };
      }
      return {
        autoAccepted: false,
        request: await tx.friendRequest.create({
          data: {
            publicId: friendRequestPublicId(),
            pairKey,
            requesterId: user.id,
            addresseeId: target.id,
          },
          include: {
            requester: {
              select: { id: true, publicId: true, name: true, profileImage: true, gender: true, dob: true, isVerified: true, isOfficial: true },
            },
            addressee: {
              select: { id: true, publicId: true, name: true, profileImage: true, gender: true, dob: true, isVerified: true, isOfficial: true },
            },
          },
        }),
      };
    });

    const requester = result.request.requester;
    const perks = await resolveUserPerks(
      [requester],
      requestOrigin(request),
      ["FRAMES", "BADGES"],
    );
    if (result.autoAccepted) {
      emitToUser(result.request.requester.publicId, "friend:accepted", {
        requestId: result.request.publicId,
        addresseeId: user.publicId,
        addresseeName: user.name,
        addresseeProfileImage: user.profileImage ?? null,
        addresseeGender: user.gender ?? null,
        addresseeDob: formatDateOnly(user.dob),
        addresseeIsVerified: Boolean(user.isVerified),
        addresseeIsOfficial: Boolean(user.isOfficial),
      });
    } else {
      emitToUser(target.publicId, "friend:request", {
        requestId: result.request.publicId,
        requesterId: requester.publicId,
        requesterName: requester.name,
        requesterProfileImage: requester.profileImage,
        requesterGender: requester.gender ?? null,
        requesterDob: formatDateOnly(requester.dob),
        requesterIsVerified: Boolean(requester.isVerified),
        requesterIsOfficial: Boolean(requester.isOfficial),
        requesterFrameUrl: perks.get(requester.publicId)?.frameUrl ?? null,
        requesterBadgeUrl: perks.get(requester.publicId)?.badgeUrl ?? null,
        createdAt: result.request.createdAt.toISOString(),
      });
    }
    return mobileJson(
      {
        success: true,
        data: {
          request: {
            id: result.request.publicId,
            status: result.request.status,
            createdAt: result.request.createdAt.toISOString(),
            respondedAt: result.request.respondedAt?.toISOString() ?? null,
          },
          autoAccepted: result.autoAccepted,
        },
      },
      result.autoAccepted ? 200 : 201,
    );
  } catch (error) {
    console.error("Friend request creation failed", error);
    return mobileApiError(error, "FRIEND_REQUEST_CREATE_FAILED");
  }
}
