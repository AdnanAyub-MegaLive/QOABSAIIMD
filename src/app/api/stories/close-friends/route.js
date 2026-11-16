import {
  storyRoute,
  prisma,
  mobileJson,
  mobileOptions,
  storyError,
} from "@/lib/story-api";
export const OPTIONS = mobileOptions;
export const GET = storyRoute(async ({ user }) =>
  mobileJson({
    success: true,
    data: {
      members: (
        await prisma.storyCloseFriend.findMany({
          where: { ownerId: user.id },
          include: { member: { select: { publicId: true, name: true } } },
        })
      ).map((r) => r.member),
    },
  }),
);
export const PUT = storyRoute(async ({ user, request }) => {
  const { memberIds } = await request.json();
  if (
    !Array.isArray(memberIds) ||
    memberIds.length > 100 ||
    memberIds.some((id) => typeof id !== "string")
  )
    throw storyError("Choose up to 100 close friends.");
  const members = await prisma.user.findMany({
    where: {
      publicId: { in: memberIds },
      id: { not: user.id },
      status: "ACTIVE",
      deletedAt: null,
      blockedUsers: { none: { blockedId: user.id } },
      blockedByUsers: { none: { blockerId: user.id } },
    },
    select: { id: true },
  });
  if (members.length !== new Set(memberIds).size)
    throw storyError("One or more users are unavailable.");
  await prisma.$transaction(async (tx) => {
    await tx.storyCloseFriend.deleteMany({ where: { ownerId: user.id } });
    await tx.storyCloseFriend.createMany({
      data: members.map((m) => ({ ownerId: user.id, memberId: m.id })),
      skipDuplicates: true,
    });
  });
  return mobileJson({ success: true, data: { saved: true } });
});
