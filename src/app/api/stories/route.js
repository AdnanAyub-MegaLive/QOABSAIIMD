import { resolveUserPerks } from "@/lib/user-perks";
import { storyRoute, prisma, mobileJson, mobileOptions } from "@/lib/story-api";
import {
  storyVisibility,
  storyGroup,
  createStory,
  storyAuthor,
} from "@/lib/stories";
export const OPTIONS = mobileOptions;
export const GET = storyRoute(async ({ user, origin, request }) => {
  const authorId = new URL(request.url).searchParams.get("authorId");
  const rows = await prisma.story.findMany({
    where: {
      AND: [
        storyVisibility(user.id),
        authorId
          ? { author: { publicId: authorId } }
          : {
              OR: [
                { authorId: user.id },
                { author: { followers: { some: { followerId: user.id } } } },
              ],
            },
      ],
    },
    include: {
      author: { select: storyAuthor },
      views: { where: { userId: user.id }, take: 1 },
      _count: { select: { views: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const perks = await resolveUserPerks(
    rows.map((r) => r.author),
    origin,
    ["FRAMES"],
  );
  const groups = new Map();
  for (const row of rows) {
    const g = storyGroup(row, origin, perks.get(row.author.publicId));
    if (!groups.has(row.authorId))
      groups.set(row.authorId, { ...g, stories: [] });
    groups.get(row.authorId).stories.unshift(g.stories[0]);
  }
  return mobileJson({
    success: true,
    data: {
      groups: [...groups.values()].sort(
        (a, b) =>
          Number(a.stories.every((s) => s.viewed)) -
            Number(b.stories.every((s) => s.viewed)) ||
          b.stories.at(-1).createdAt.localeCompare(a.stories.at(-1).createdAt),
      ),
    },
  });
});
export const POST = storyRoute(async ({ user, request, origin }) =>
  mobileJson(
    { success: true, data: await createStory(prisma, user, request, origin) },
    201,
  ),
);
