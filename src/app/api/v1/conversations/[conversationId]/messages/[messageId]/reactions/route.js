import { prisma } from '@/lib/prisma';
import { changeMessageReaction } from '@/lib/message-reactions';
import { hydratePostMessages } from '@/lib/chat-posts';
import { serializeMessage } from '@/lib/messaging';
import { mobileApiError, requireMobileUser } from '@/lib/mobile-api';
import { resolveUserPerks, requestOrigin } from '@/lib/user-perks';
import { v1Json, v1Options, withV1Request } from '@/lib/mobile-v1';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const path='/api/v1/conversations/:conversationId/messages/:messageId/reactions';
const methods='POST, DELETE, OPTIONS';
export function OPTIONS(request){return v1Options(request,methods);}
function handle(request,params,remove){
  return withV1Request(request,{path,methods,rateLimit:{limit:60,windowMs:60000}},async({requestId})=>{
    try {
      const user=await requireMobileUser(request);
      const {conversationId,messageId}=await params;
      const emoji=remove ? new URL(request.url).searchParams.get('emoji') ?? undefined : (await request.json())?.emoji;
      let prepared;
      const data=await changeMessageReaction(prisma,{conversationId,messageId,userId:user.id,emoji,remove},async(record,viewerId)=>{
        prepared ??= Promise.all([
          resolveUserPerks(record.sender?[record.sender]:[],requestOrigin(request),['FRAMES','BADGES','CHAT_BOXES']),
          hydratePostMessages(prisma,[record],requestOrigin(request)),
        ]);
        const [perks,[hydrated]]=await prepared;
        return serializeMessage(hydrated,perks.get(record.sender?.publicId),viewerId);
      });
      return v1Json(request,requestId,{success:true,data},200,methods);
    } catch(error){return mobileApiError(error,'MESSAGE_REACTION_FAILED');}
  });
}
export function POST(request,{params}){return handle(request,params,false);}
export function DELETE(request,{params}){return handle(request,params,true);}
