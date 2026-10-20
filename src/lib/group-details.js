import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "./prisma.js";
import { assertChatWordsAllowed } from "./chat-word-policy.js";
import { chatError, privateChatObject } from "./chat-media.js";
import { normalizeGroupName, groupConversationWithArtwork, serializeMessage } from "./messaging.js";

export const groupInclude = { participants: { include: { user: { select: { id: true, publicId: true, name: true, profileImage: true, isVerified: true, isOfficial: true } } }, orderBy: { joinedAt: "asc" } } };
export function groupDetails(conversation) {
  const owner = conversation.participants?.find(p => p.role === "OWNER")?.user;
  return { description: conversation.description ?? null, iconUrl: conversation.iconId ? `/api/v1/conversations/${conversation.publicId}/icon/${conversation.iconId}` : null, iconMimeType: conversation.iconId ? "image/webp" : null, owner: owner ? { publicId: owner.publicId, name: owner.name, profileImage: owner.profileImage ?? null } : null, revision: conversation.revision ?? 0, closed: Boolean(conversation.closedAt) };
}
export async function requireActiveGroup(db, publicId, actorId, ownerOnly = false) {
  const actor = await db.user.findFirst({ where: { id: actorId, status: "ACTIVE", deletedAt: null, bans: { none: { target: "USER", revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } }, select: { id: true, publicId: true, name: true } });
  if (!actor) throw chatError("USER_NOT_FOUND", "This account cannot manage groups.");
  const group = await db.conversation.findUnique({ where: { publicId }, include: groupInclude });
  if (!group || group.closedAt) throw chatError("CONVERSATION_NOT_FOUND", "Group not found.");
  if (group.kind !== "GROUP") throw chatError("GROUP_CONVERSATION_REQUIRED", "This operation requires a group.");
  const membership = group.participants.find(p => p.userId === actorId);
  if (!membership) throw chatError("CONVERSATION_NOT_FOUND", "You are not a member of this group.");
  if (ownerOnly && membership.role !== "OWNER") throw chatError("GROUP_OWNER_REQUIRED", "Only the group owner can do this.");
  return { group, actor, membership };
}
export async function groupTransaction(work, db = prisma) {
  for (let attempt=0;attempt<4;attempt++) {
    try { return await db.$transaction(work, { isolationLevel: "Serializable", timeout: 15000 }); }
    catch (error) { if (!["P2034","P2002"].includes(error.code) || attempt === 3) throw error; }
  }
}
export async function changeGroup(publicId, actorId, requestId, input, db = prisma, origin = process.env.MOBILE_API_BASE_URL || process.env.AUTH_URL) {
  if (typeof requestId !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(requestId)) throw chatError("VALIDATION_ERROR", "Supply an 8–128 character Idempotency-Key.");
  const fingerprint = createHash("sha256").update(JSON.stringify({ publicId, name: input.name, description: input.description, ownerPublicId: input.ownerPublicId, icon: input.icon?.mediaVersion, removeIcon: input.removeIcon })).digest("hex");
  return groupTransaction(async tx => {
    // Membership and ban checks still apply to retries. A successful former owner may replay a transfer.
    const {group,actor,membership} = await requireActiveGroup(tx, publicId, actorId);
    const prior = await tx.groupChangeRequest.findUnique({ where: { actorId_requestId: { actorId, requestId } } });
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw chatError("IDEMPOTENCY_CONFLICT", "This request ID has different group changes.");
      return prior.result;
    }
    if (membership.role !== "OWNER") throw chatError("GROUP_OWNER_REQUIRED", "Only the group owner can do this.");
    const data = {}, changes = [];
    if (Object.hasOwn(input,"name")) {
      if(typeof input.name !== "string") throw chatError("GROUP_NAME_INVALID","Group name must be text.");
      const name = normalizeGroupName(input.name); await assertChatWordsAllowed(tx,name);
      if(name!==group.name){data.name=name;changes.push("changed the group name");}
    }
    if(Object.hasOwn(input,"description")){
      if(input.description!==null && typeof input.description!=="string")throw chatError("VALIDATION_ERROR","Description must be text or null.");
      const description=(input.description??"").trim();
      if([...description].length>500)throw chatError("VALIDATION_ERROR","Description may contain at most 500 characters.");
      await assertChatWordsAllowed(tx,description);
      if((group.description??"")!==description){data.description=description||null;changes.push("changed the description");}
    }
    if(input.ownerPublicId){
      const next=group.participants.find(p=>p.user.publicId===input.ownerPublicId);
      if(!next)throw chatError("GROUP_MEMBER_NOT_FOUND","Choose a current group member.");
      if(next.userId!==actorId){
        await requireActiveGroup(tx,publicId,next.userId);
        await tx.conversationParticipant.update({where:{id:membership.id},data:{role:"MEMBER"}});
        await tx.conversationParticipant.update({where:{id:next.id},data:{role:"OWNER"}});
        changes.push(`made ${next.user.name} the group owner`);
      }
    }
    if(input.icon || (input.removeIcon && group.iconId)){
      if(input.icon){
        const icon=await tx.groupIcon.findFirst({where:{id:input.icon.id,conversationId:group.id,expiresAt:{gt:new Date()}}});
        if(!icon)throw chatError("VALIDATION_ERROR","Icon upload expired. Upload again.");
        await tx.groupIcon.update({where:{id:icon.id},data:{expiresAt:null,publishedAt:new Date()}});
        data.iconId=icon.id;
      }else data.iconId=null;
      if(group.iconId)await tx.groupIcon.update({where:{id:group.iconId},data:{expiresAt:new Date(Date.now()+3600000)}});
      changes.push(input.icon?"changed the group icon":"removed the group icon");
    }
    let updated=group;
    if(changes.length){
      updated=await tx.conversation.update({where:{id:group.id},data:{...data,revision:{increment:1},lastMessageAt:new Date()},include:groupInclude});
      const message=await tx.message.create({data:{publicId:`MSG-${randomUUID()}`,conversationId:group.id,senderId:null,body:`${actor.name} ${changes.join(" and ")}.`,kind:"system"}});
      const members=updated.participants.map(p=>({messageId:message.id,userId:p.userId}));
      if(members.length)await tx.messageReceipt.createMany({data:members});
      await tx.realtimeOutbox.create({data:{channel:`conversation:${publicId}`,event:"message:new",payload:{conversationId:publicId,message:serializeMessage(message)}}});
      await tx.auditLog.create({data:{action:"GROUP_UPDATED",category:"MESSAGING",entityType:"Conversation",entityId:group.id,description:`${actor.publicId} updated group details.`,metadata:{actorUserId:actorId,requestId,changes}}});
    }
    const result={conversation:await groupConversationWithArtwork(updated,origin,tx)};
    if(changes.length)await tx.realtimeOutbox.create({data:{channel:`conversation:${publicId}`,event:"conversation:updated",payload:result}});
    await tx.groupChangeRequest.create({data:{actorId,requestId,fingerprint,result}});
    return result;
  },db);
}
export async function decodeGroupIcon(file){
  if(file.size>5*1024*1024)throw chatError("FILE_TOO_LARGE","Group icons must be at most 5 MB.");
  const format={"image/jpeg":"jpeg","image/png":"png","image/webp":"webp"}[file.type];
  if(!format)throw chatError("VALIDATION_ERROR","Use a still JPEG, PNG or WebP icon.");
  try{
    const image=sharp(Buffer.from(await file.arrayBuffer()),{animated:true,limitInputPixels:25000000,failOn:"warning"});
    const meta=await image.metadata();if(meta.format!==format||(meta.pages??1)!==1)throw Error("Invalid icon");
    return await image.rotate().resize({width:512,height:512,fit:"inside",withoutEnlargement:true}).webp({quality:85}).toBuffer();
  }catch{throw chatError("VALIDATION_ERROR","Invalid image or animated icon. Use a still picture.");}
}
export async function removeGroupMemberSafely(publicId,actorId,targetPublicId,db=prisma){
  const result=await groupTransaction(async tx=>{
    const {group,membership}=await requireActiveGroup(tx,publicId,actorId);
    const target=group.participants.find(p=>p.user.publicId===targetPublicId);
    if(!target)throw chatError("GROUP_MEMBER_NOT_FOUND","Group member not found.");
    if(target.userId!==actorId&&membership.role!=="OWNER")throw chatError("GROUP_OWNER_REQUIRED","Only the group owner can remove members.");
    if(target.role==="OWNER"&&group.participants.length>1)throw chatError("GROUP_OWNER_CANNOT_LEAVE","Transfer ownership before leaving this group.");
    await tx.conversationParticipant.delete({where:{id:target.id}});
    const closing=target.role==="OWNER";
    if(closing&&group.iconId)await tx.groupIcon.update({where:{id:group.iconId},data:{expiresAt:new Date(Date.now()+3600000)}});
    return tx.conversation.update({where:{id:group.id},data:{revision:{increment:1},...(closing?{closedAt:new Date(),iconId:null}:{})},include:groupInclude});
  },db);
  globalThis.portalIo?.in(`user:${targetPublicId}`).socketsLeave(`conversation:${publicId}`);
  return result;
}
export async function addGroupMemberSafely(publicId,actorId,targetPublicId,db=prisma){
  const result=await groupTransaction(async tx=>{
    const {group}=await requireActiveGroup(tx,publicId,actorId,true);
    if(group.participants.length>=100)throw chatError("GROUP_MEMBERS_INVALID","Groups support at most 100 members.");
    const target=await tx.user.findFirst({where:{publicId:targetPublicId,status:"ACTIVE",deletedAt:null,bans:{none:{target:"USER",revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}}},select:{id:true}});
    if(!target)throw chatError("GROUP_MEMBER_NOT_FOUND","An active group member is required.");
    if(group.participants.some(p=>p.userId===target.id))throw chatError("GROUP_MEMBER_EXISTS","This person is already in the group.");
    return tx.conversation.update({where:{id:group.id},data:{revision:{increment:1},participants:{create:{userId:target.id,role:"MEMBER"}}},include:groupInclude});
  },db);
  globalThis.portalIo?.in(`user:${targetPublicId}`).socketsJoin(`conversation:${publicId}`);
  return result;
}
export async function pruneGroupIcons(db,now=new Date()){
  const rows=await db.groupIcon.findMany({where:{expiresAt:{lte:now}},take:100});
  for(const row of rows){try{await privateChatObject("delete",row.key);await db.groupIcon.delete({where:{id:row.id}});}catch{console.error("Group icon cleanup will retry",row.id);}}
}
