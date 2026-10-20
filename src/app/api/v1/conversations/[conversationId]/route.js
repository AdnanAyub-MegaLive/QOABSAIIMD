import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from "@/lib/mobile-api";
import { changeGroup, requireActiveGroup } from "@/lib/group-details";
import { groupConversationWithArtwork } from "@/lib/messaging";
import { requestOrigin } from "@/lib/user-perks";
import { isRateLimited } from "@/lib/rate-limit";
import { chatError } from "@/lib/chat-media";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export function OPTIONS(){return mobileOptions();}
export async function GET(request,{params}){
  try{
    const user=await requireMobileUser(request),{conversationId}=await params;
    const {group}=await requireActiveGroup(prisma,conversationId,user.id);
    return mobileJson({success:true,data:{conversation:await groupConversationWithArtwork(group,requestOrigin(request))}});
  }catch(error){return mobileApiError(error,"GROUP_DETAILS_FAILED");}
}
export async function PATCH(request,{params}){
  try{
    const user=await requireMobileUser(request),{conversationId}=await params;
    if(isRateLimited(`group-edit:${user.id}`,{limit:30,windowMs:60000}))throw chatError("RATE_LIMITED","Please wait before editing again.");
    const body=await request.json();
    if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!["name","description","ownerPublicId","requestId"].includes(k))||(!Object.hasOwn(body,"name")&&!Object.hasOwn(body,"description")&&!Object.hasOwn(body,"ownerPublicId")))throw chatError("VALIDATION_ERROR","Provide name, description or ownerPublicId.");
    if(Object.hasOwn(body,"ownerPublicId")&&(typeof body.ownerPublicId!=="string"||!body.ownerPublicId.trim()))throw chatError("VALIDATION_ERROR","Provide the new owner's public ID.");
    const result=await changeGroup(conversationId,user.id,request.headers.get("Idempotency-Key")??body.requestId,body,prisma,requestOrigin(request));
    return mobileJson({success:true,data:result});
  }catch(error){return mobileApiError(error,"GROUP_UPDATE_FAILED");}
}
