import {prisma} from "@/lib/prisma";
import {requireMobileUser,mobileApiError} from "@/lib/mobile-api";
import {assertConversationMessagingAllowed} from "@/lib/user-blocks";
import {voiceObject} from "@/lib/voice-storage";
export async function GET(request,{params}){
 try{
  const user=await requireMobileUser(request),{conversationId,messageId}=await params;
  const row=await prisma.message.findFirst({where:{publicId:messageId,deletedAt:null,conversation:{OR:[{publicId:conversationId},{id:conversationId}],participants:{some:{userId:user.id}}}},include:{conversation:true}});
  if(!row?.voiceKey)return new Response(null,{status:404});
  await assertConversationMessagingAllowed(row.conversation,user.id);
  const object=await voiceObject("get",row.voiceKey);
  return new Response(await object.Body.transformToByteArray(),{headers:{"Content-Type":row.voiceMimeType,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch(error){return mobileApiError(error,"VOICE_DOWNLOAD_FAILED");}
}
