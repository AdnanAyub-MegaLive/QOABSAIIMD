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

export async function assertMutualFollow(leftUserId, rightUserId, client = prisma) {
  await assertUsersCanInteract(leftUserId,rightUserId,client);
  const users=await client.user.findMany({where:{id:{in:[leftUserId,rightUserId]},bans:{none:{target:"USER",revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}}},select:{status:true,deletedAt:true,isOfficial:true,appRoles:true}});
  if(users.length!==2||users.some(u=>u.status!=="ACTIVE"||u.deletedAt))throw Object.assign(new Error("USER_NOT_FOUND"),{code:"USER_NOT_FOUND"});
  if(users.some(u=>u.isOfficial||u.appRoles.some(r=>["RESELLER","CS","CS_LEADER"].includes(r))))return;
  const count=await client.userFollow.count({where:{OR:[{followerId:leftUserId,followedId:rightUserId},{followerId:rightUserId,followedId:leftUserId}]}});
  if(count!==2)throw Object.assign(new Error("You can message each other once you both follow each other."),{code:"MUTUAL_FOLLOW_REQUIRED",validationMessage:"You can message each other once you both follow each other."});
}
export async function assertConversationMessagingAllowed(conversation, userId, client = prisma, sending = false) {
  if (conversation.kind !== "DIRECT") return;
  const counterpart = await client.conversationParticipant.findFirst({
    where: { conversationId: conversation.id, userId: { not: userId } },
    select: { userId: true },
  });
  if (counterpart) await (sending?assertMutualFollow:assertUsersCanInteract)(userId, counterpart.userId, client);
  else if(sending)throw Object.assign(new Error("CONVERSATION_NOT_FOUND"),{code:"CONVERSATION_NOT_FOUND"});
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
