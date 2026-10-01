import { prisma } from "../../../../../../lib/prisma.js";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "../../../../../../lib/mobile-api.js";
import { emitToUser } from "../../../../../../lib/realtime.js";
import { formatDateOnly } from "../../../../../../lib/date-only.js";

export function OPTIONS() {
  return mobileOptions();
}

export async function POST(request, { params }) {
  try {
    const user = await requireMobileUser(request);
    const { requestId } = await params;
    const result = await prisma.$transaction(async (tx) => {
      const record = await tx.friendRequest.findUnique({
        where: { publicId: requestId },
        include: {
          requester: {
            select: { publicId: true, name: true, profileImage: true },
          },
        },
      });
      if (!record) throw new Error("FRIEND_REQUEST_NOT_FOUND");
      if (record.addresseeId !== user.id)
        throw new Error("FRIEND_REQUEST_FORBIDDEN");
      if (record.status !== "PENDING")
        throw new Error("FRIEND_REQUEST_RESOLVED");
      return tx.friendRequest.update({
        where: { id: record.id },
        data: { status: "ACCEPTED", respondedAt: new Date() },
        include: {
          requester: {
            select: { publicId: true, name: true, profileImage: true },
          },
        },
      });
    });
    emitToUser(result.requester.publicId, "friend:accepted", {
      requestId: result.publicId,
      addresseeId: user.publicId,
      addresseeName: user.name,
      addresseeProfileImage: user.profileImage ?? null,
      addresseeGender: user.gender ?? null,
      addresseeDob: formatDateOnly(user.dob),
      addresseeIsVerified: Boolean(user.isVerified),
      addresseeIsOfficial: Boolean(user.isOfficial),
    });
    return mobileJson({
      success: true,
      data: {
        request: {
          id: result.publicId,
          status: result.status,
          respondedAt: result.respondedAt.toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("Friend request acceptance failed", error);
    return mobileApiError(error, "FRIEND_REQUEST_ACCEPT_FAILED");
  }
}
