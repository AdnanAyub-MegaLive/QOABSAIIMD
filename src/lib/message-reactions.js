import { validateReactionEmoji } from './message-reaction-summary.js';
import { assertConversationMessagingAllowed } from './user-blocks.js';

export async function changeMessageReaction(db, {conversationId,messageId,userId,emoji,remove=false}, present) {
  if (!remove || emoji !== undefined) emoji = validateReactionEmoji(emoji);
  return db.$transaction(async tx => {
    const membership = await tx.conversationParticipant.findFirst({
      where:{userId,conversation:{publicId:conversationId}},include:{conversation:true},
    });
    if (!membership || membership.conversation.kind === 'WORLD') throw Object.assign(new Error('CONVERSATION_NOT_FOUND'),{code:'CONVERSATION_NOT_FOUND'});
    await assertConversationMessagingAllowed(membership.conversation,userId,tx);
    // Serialize updates for this message, including simultaneous message deletion.
    const [locked] = await tx.$queryRaw`SELECT id,"deletedAt" FROM "Message" WHERE "publicId"=${messageId} AND "conversationId"=${membership.conversationId} FOR UPDATE`;
    if (!locked || locked.deletedAt) throw Object.assign(new Error('MESSAGE_NOT_FOUND'),{code:'MESSAGE_NOT_FOUND'});
    if (remove) await tx.messageReaction.deleteMany({where:{messageId:locked.id,userId,...(emoji===undefined?{}:{emoji})}});
    else await tx.messageReaction.upsert({where:{messageId_userId_emoji:{messageId:locked.id,userId,emoji}},update:{},create:{messageId:locked.id,userId,emoji}});
    const message = await tx.message.findUnique({where:{id:locked.id},include:{sender:true,conversation:{select:{publicId:true}},reactions:{select:{userId:true,emoji:true}}}});
    const participants = await tx.conversationParticipant.findMany({where:{conversationId:membership.conversationId},select:{userId:true,user:{select:{publicId:true}}}});
    const payloads = await Promise.all(participants.map(async p=>({
      channel:`user:${p.user.publicId}`,event:'message:updated',
      payload:{conversationId,message:await present(message,p.userId)},
    })));
    await tx.realtimeOutbox.createMany({data:payloads});
    return {conversationId,message:await present(message,userId)};
  });
}
