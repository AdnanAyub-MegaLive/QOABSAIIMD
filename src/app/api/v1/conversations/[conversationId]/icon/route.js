import { randomUUID, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireMobileUser,mobileJson,mobileApiError,mobileOptions } from "@/lib/mobile-api";
import { requireActiveGroup,changeGroup,decodeGroupIcon } from "@/lib/group-details";
import { readAvatarFile, AVATAR_MAX_BYTES } from "@/lib/avatar-upload";
import { privateChatObject,chatError } from "@/lib/chat-media";
import { isRateLimited } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/user-perks";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export function OPTIONS(){return mobileOptions();}
export async function POST(request,{params}){
  try{
    const user=await requireMobileUser(request),{conversationId}=await params;
    const {group}=await requireActiveGroup(prisma,conversationId,user.id,true);
    const requestId=request.headers.get("Idempotency-Key");
    if(!/^[A-Za-z0-9._:-]{8,128}$/.test(requestId??""))throw chatError("VALIDATION_ERROR","Provide Idempotency-Key.");
    if(isRateLimited(`group-icon:${user.id}`,{limit:10,windowMs:3600000}))throw chatError("RATE_LIMITED","Group icons allow 10 changes per hour.");
    const bytes=await decodeGroupIcon(await readAvatarFile(request,AVATAR_MAX_BYTES));
    const mediaVersion=createHash("sha256").update(bytes).digest("hex").slice(0,16),key=`private-chat/${randomUUID()}.webp`;
    // Cleanup record is created before upload; retries/failed writes leave only expiring objects.
    const icon=await prisma.groupIcon.create({data:{conversationId:group.id,key,mediaVersion,expiresAt:new Date(Date.now()+86400000)}});
    await privateChatObject("put",key,{bytes,mimeType:"image/webp"});
    const result=await changeGroup(conversationId,user.id,requestId,{icon},prisma,requestOrigin(request));
    return mobileJson({success:true,data:result},201);
  }catch(error){return mobileApiError(error,"GROUP_ICON_FAILED");}
}
export async function DELETE(request,{params}){
  try{
    const user=await requireMobileUser(request),{conversationId}=await params;
    if(isRateLimited(`group-edit:${user.id}`,{limit:30,windowMs:60000}))throw chatError("RATE_LIMITED","Please wait before editing again.");
    const result=await changeGroup(conversationId,user.id,request.headers.get("Idempotency-Key"),{removeIcon:true},prisma,requestOrigin(request));
    return mobileJson({success:true,data:result});
  }catch(error){return mobileApiError(error,"GROUP_ICON_FAILED");}
}
