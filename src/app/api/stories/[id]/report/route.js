import {
  storyRoute,
  prisma,
  mobileJson,
  mobileOptions,
  visibleStory,
  storyError,
} from "@/lib/story-api";
export const OPTIONS = mobileOptions;
export const POST = storyRoute(async ({ user, params, request }) => {
  const row = await visibleStory(prisma, params.id, user.id),
    { reason } = await request.json();
  if (
    row.authorId === user.id ||
    typeof reason !== "string" ||
    !reason.trim() ||
    reason.length > 500
  )
    throw storyError("Provide a reason for reporting this story.");
  await prisma.storyReport.upsert({
    where: { storyId_userId: { storyId: row.id, userId: user.id } },
    create: { storyId: row.id, userId: user.id, reason },
    update: { reason, status: "OPEN" },
  });
  return mobileJson({ success: true, data: { reported: true } });
});
