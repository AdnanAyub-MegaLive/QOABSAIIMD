import { resolveUserPerks } from "@/lib/user-perks";
import {
  storyRoute,
  prisma,
  mobileJson,
  mobileOptions,
  visibleStory,
  ownStory,
} from "@/lib/story-api";
import { storyGroup } from "@/lib/stories";
export const OPTIONS = mobileOptions;
export const GET = storyRoute(async ({ user, params, origin }) => {
  const row = await visibleStory(prisma, params.id, user.id);
  const perks = await resolveUserPerks([row.author], origin, ["FRAMES"]);
  return mobileJson({
    success: true,
    data: storyGroup(row, origin, perks.get(row.author.publicId)),
  });
});
export const DELETE = storyRoute(async ({ user, params }) => {
  const row = await ownStory(params.id, user);
  await prisma.$transaction(async (tx) => {
    await tx.story.update({
      where: { id: row.id },
      data: { deletedAt: new Date(), caption: "" },
    });
    if (row.mediaKey)
      await tx.storyMediaObject.updateMany({
        where: { key: row.mediaKey },
        data: { expiresAt: new Date() },
      });
  });
  return mobileJson({ success: true, data: { deleted: true } });
});
