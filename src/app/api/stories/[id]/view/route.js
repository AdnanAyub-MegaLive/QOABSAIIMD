import {
  storyRoute,
  prisma,
  mobileJson,
  mobileOptions,
  visibleStory,
} from "@/lib/story-api";
export const OPTIONS = mobileOptions;
export const POST = storyRoute(async ({ user, params }) => {
  const row = await visibleStory(prisma, params.id, user.id);
  if (row.authorId !== user.id)
    await prisma.storyView.createMany({
      data: [{ storyId: row.id, userId: user.id }],
      skipDuplicates: true,
    });
  return mobileJson({ success: true, data: { viewed: true } });
});
