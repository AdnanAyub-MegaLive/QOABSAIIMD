import { prisma } from "./prisma.js";

export function friendPairKey(leftId, rightId) {
  return [leftId, rightId].sort().join(":");
}

export function friendRequestPublicId() {
  return `FRQ-${crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 16)
    .toUpperCase()}`;
}

export async function findFriendRequestByPublicId(requestId, client = prisma) {
  return client.friendRequest.findUnique({
    where: { publicId: requestId },
    include: {
      requester: {
        select: { id: true, publicId: true, name: true, profileImage: true, gender: true, dob: true, isVerified: true, isOfficial: true, deletedAt: true },
      },
      addressee: {
        select: { id: true, publicId: true, name: true, profileImage: true, gender: true, dob: true, isVerified: true, isOfficial: true, deletedAt: true },
      },
    },
  });
}

export function friendStatusFor(record, callerId) {
  if (!record || record.status === "DECLINED")
    return { status: "none", requestId: null };
  if (record.status === "ACCEPTED")
    return { status: "friends", requestId: record.publicId };
  return {
    status:
      record.requesterId === callerId ? "pending_sent" : "pending_received",
    requestId: record.publicId,
  };
}
