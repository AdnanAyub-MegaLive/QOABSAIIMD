import {
  storyRoute,
  prisma,
  mobileJson,
  mobileOptions,
  ownStory,
} from "@/lib/story-api";
export const OPTIONS = mobileOptions;
export const GET = storyRoute(async ({ user, params, request }) => {
  const row = await ownStory(params.id, user),
    q = new URL(request.url).searchParams,
    cursor = q.get("cursor");
  const rows = await prisma.storyView.findMany({
    where: { storyId: row.id },
    include: {
      user: { select: { publicId: true, name: true, profileImage: true } },
    },
    orderBy: { userId: "asc" },
    take: 51,
    ...(cursor
      ? {
          cursor: { storyId_userId: { storyId: row.id, userId: cursor } },
          skip: 1,
        }
      : {}),
  });
  return mobileJson({
    success: true,
    data: {
      viewers: rows
        .slice(0, 50)
        .map((r) => ({ ...r.user, viewedAt: r.createdAt })),
      nextCursor: rows.length > 50 ? rows[49].userId : null,
    },
  });
});
