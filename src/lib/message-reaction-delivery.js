import { summarizeReactions } from './message-reaction-summary.js';
// A delayed reaction must not restore text which was edited/deleted after the
// reaction committed. Recheck membership and read current presentation on send.
export async function refreshReactionDelivery(db,row) {
 const member=await db.conversationParticipant.findFirst({where:{
   conversation:{publicId:row.payload.conversationId},
   user:{publicId:row.channel.slice(5),status:'ACTIVE',deletedAt:null},
 },select:{userId:true,conversationId:true}});
 if(!member)return null;
 const record=await db.message.findFirst({where:{publicId:row.payload.message.id,conversationId:member.conversationId},
   include:{reactions:{select:{emoji:true,userId:true}}}});
 if(!record)return null;
 return {...row.payload,message:{...row.payload.message,
   body:record.deletedAt?null:record.body,metadata:record.deletedAt?null:record.metadata,
   media:record.deletedAt?null:record.media,gift:record.deletedAt?null:record.gift,
   ...(record.deletedAt?{voice:null,post:null}:{}),
   editedAt:record.editedAt?.toISOString()??null,deletedAt:record.deletedAt?.toISOString()??null,
   reactions:record.deletedAt?[]:summarizeReactions(record.reactions,member.userId),
 }};
}
