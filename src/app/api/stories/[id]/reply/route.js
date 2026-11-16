import {chatSenderPerks} from "@/lib/chat-perks-cache";
import { assertMutualFollow } from "@/lib/user-blocks";
import {
  storyRoute,
  prisma,
  mobileJson,
  mobileOptions,
  visibleStory,
  storyError,
} from "@/lib/story-api";
import { createMessage, emitConversationEvent } from "@/lib/messaging";
export const OPTIONS = mobileOptions;
export const POST = storyRoute(async ({ user, params, request, origin }) => {
  const story = await visibleStory(prisma, params.id, user.id),
    body = await request.json();
  if (story.authorId === user.id)
    throw storyError("You cannot reply to yourself.");
  await assertMutualFollow(user.id, story.authorId);
  const directKey = [user.id, story.authorId].sort().join(":");
  const conversation = await prisma.conversation.upsert({
    where: { directKey },
    update: {},
    create: {
      directKey,
      publicId: `CONV-${crypto.randomUUID()}`,
      kind: "DIRECT",
      participants: {
        create: [{ userId: user.id }, { userId: story.authorId }],
      },
    },
  });
  const message = await createMessage(
    conversation,
    user,
    body.body,
    await chatSenderPerks(user,origin),
    { storyId: params.id, clientMessageId: body.clientMessageId, origin },
  );
  if (globalThis.portalIo)
    await emitConversationEvent(
      globalThis.portalIo,
      conversation.publicId,
      "message:new",
      { conversationId: conversation.publicId, message },
    );
  return mobileJson({
    success: true,
    data: { conversationId: conversation.publicId, message },
  });
});
