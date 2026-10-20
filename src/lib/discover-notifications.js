import { notifyAction } from "./action-notifications.js";
export async function discoverNotification(db,{actorId,userId,type,postId,commentId,key}) {
  if(actorId===userId)return;
  const actor=await db.user.findUnique({where:{id:actorId},select:{publicId:true,name:true,profileImage:true}});
  if(!actor)return;
  const verbs={POST_LIKE:"liked your post",POST_COMMENT:"commented on your post",COMMENT_REPLY:"replied to your comment",COMMENT_LIKE:"liked your comment",POST_MENTION:"mentioned you"};
  await notifyAction(db,{userId,key:`discover:${type}:${key}`,type,title:"Discover activity",body:`${actor.name} ${verbs[type]??"interacted with you"}.`,action:{screen:"DISCOVER_POST",actor,postId,...(commentId?{commentId}:{})}});
}
export async function notifyMentions(db,{actorId,text,postId,commentId}) {
  const ids=[...new Set([...String(text??"").matchAll(/@((?:USR|TLN)-[a-zA-Z0-9-]+)/g)].map(m=>m[1]))].slice(0,20);
  if(!ids.length)return;
  const users=await db.user.findMany({where:{publicId:{in:ids},status:"ACTIVE",deletedAt:null,id:{not:actorId}},select:{id:true}});
  for(const user of users){
    const blocked=await db.userBlock.findFirst({where:{OR:[{blockerId:actorId,blockedId:user.id},{blockerId:user.id,blockedId:actorId}]}});
    if(!blocked)await discoverNotification(db,{actorId,userId:user.id,type:"POST_MENTION",postId,commentId,key:`${commentId??postId}:${actorId}`});
  }
}
