import { prisma } from "./prisma.js";

function blockedError() {
  const error = new Error("USER_BLOCKED");
  error.code = "USER_BLOCKED";
  return error;
}

export async function assertUsersCanInteract(leftUserId, rightUserId, client = prisma) {
  const block = await client.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: leftUserId, blockedId: rightUserId },
        { blockerId: rightUserId, blockedId: leftUserId },
      ],
    },
    select: { blockerId: true },
  });
  if (block) throw blockedError();
}

export async function assertConversationMessagingAllowed(conversation, userId, client = prisma) {
  if (conversation.kind !== "DIRECT") return;
  const counterpart = await client.conversationParticipant.findFirst({
    where: { conversationId: conversation.id, userId: { not: userId } },
    select: { userId: true },
  });
  if (counterpart) await assertUsersCanInteract(userId, counterpart.userId, client);
}

export async function listBlockedUserIds(userId, client = prisma) {
  const records = await client.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return new Set(records.map((record) => (
    record.blockerId === userId ? record.blockedId : record.blockerId
  )));
}
