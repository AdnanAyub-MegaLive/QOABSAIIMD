import { prisma } from "@/lib/prisma";
import { requireMobileUser,mobileApiError,mobileOptions } from "@/lib/mobile-api";
import { requireActiveGroup } from "@/lib/group-details";
import { privateChatObject,chatError } from "@/lib/chat-media";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export function OPTIONS(){return mobileOptions();}
export async function GET(request,{params}){
  try{
    const user=await requireMobileUser(request),{conversationId,iconId}=await params;
    const {group}=await requireActiveGroup(prisma,conversationId,user.id);
    const icon=await prisma.groupIcon.findFirst({where:{id:iconId,conversationId:group.id,publishedAt:{not:null},OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}});
    // Pending uploads are not readable until selected; retired links have a one-hour grace.
    if(!icon)throw chatError("MESSAGE_NOT_FOUND","Icon not found.");
    const result=await privateChatObject("get",icon.key);
    return new Response(result.Body.transformToWebStream(),{headers:{"Content-Type":"image/webp","Cache-Control":"private, no-store","Vary":"Authorization","X-Content-Type-Options":"nosniff"}});
  }catch(error){if(error.name==="NoSuchKey")error=chatError("MESSAGE_NOT_FOUND","Icon not found.");return mobileApiError(error,"GROUP_ICON_FAILED");}
}
