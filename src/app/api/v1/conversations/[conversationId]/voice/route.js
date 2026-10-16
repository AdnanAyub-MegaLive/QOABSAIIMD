import {randomUUID,createHash} from "node:crypto";
import {prisma} from "@/lib/prisma";
import {requireMobileUser,mobileJson,mobileApiError,mobileOptions} from "@/lib/mobile-api";
import {requireConversationParticipant,createMessage,emitConversationEvent} from "@/lib/messaging";
import {assertConversationMessagingAllowed} from "@/lib/user-blocks";
import {voiceObject} from "@/lib/voice-storage";
import {validateVoice} from "@/lib/voice-validation";
import {chatSenderPerks} from "@/lib/chat-perks-cache";
import {requestOrigin} from "@/lib/user-perks";
import {isRateLimited} from "@/lib/rate-limit";
export const runtime="nodejs";
export function OPTIONS(){return mobileOptions();}
export async function POST(request,{params}){
 let uploadedKey;
 try{
  const user=await requireMobileUser(request),{conversationId}=await params;
  const membership=await requireConversationParticipant(conversationId,user.id);
  await assertConversationMessagingAllowed(membership.conversation,user.id,prisma,true);
  if(!["DIRECT","GROUP"].includes(membership.conversation.kind))throw Object.assign(new Error("Voice messages are only allowed in private and group chats."),{code:"VALIDATION_ERROR"});
  if(isRateLimited(`voice:${user.id}`,{limit:10,windowMs:60000}))throw Object.assign(new Error("Too many voice uploads."),{code:"RATE_LIMITED"});
  const reader=request.body?.getReader();if(!reader)throw Error("Missing body");let size=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024*1024+65536){await reader.cancel();throw Object.assign(new Error("Audio exceeds 1 MB."),{code:"FILE_TOO_LARGE"});}chunks.push(value);}}finally{reader.releaseLock();}
  let form;try{form=await new Response(Buffer.concat(chunks),{headers:{"content-type":request.headers.get("content-type")??""}}).formData();}catch{throw Object.assign(new Error("Send a multipart audio upload."),{code:"VALIDATION_ERROR"});}
  const audio=form.get("audio"),clientMessageId=form.get("clientMessageId"),durationMs=Number(form.get("durationMs"));
  if(!(audio instanceof File)||form.getAll("audio").length!==1||typeof clientMessageId!=="string"||!clientMessageId.trim()||clientMessageId.length>128)throw Object.assign(new Error("Provide audio, durationMs and clientMessageId."),{code:"VALIDATION_ERROR"});
  if(!["audio/mp4","audio/m4a","audio/x-m4a","audio/aac"].includes(audio.type))throw Object.assign(new Error("Use an AAC M4A recording."),{code:"VALIDATION_ERROR"});
  const bytes=Buffer.from(await audio.arrayBuffer()),actualDuration=await validateVoice(bytes,durationMs);
  uploadedKey=`private-voice/${randomUUID()}.m4a`;
  await prisma.voiceObject.create({data:{key:uploadedKey,expiresAt:new Date(Date.now()+30*86400000)}});
  await voiceObject("put",uploadedKey,bytes);
  const message=await createMessage(membership.conversation,user,null,await chatSenderPerks(user,requestOrigin(request)),{clientMessageId,voice:{key:uploadedKey,durationMs:actualDuration,mimeType:"audio/mp4",hash:createHash("sha256").update(bytes).digest("hex")}});
  const savedKey=uploadedKey;uploadedKey=null; // Never delete a committed recording after a later delivery/read failure.
  const stored=await prisma.message.findUnique({where:{publicId:message.id},select:{voiceKey:true}});
  if(stored.voiceKey!==savedKey)await voiceObject("delete",savedKey);
  await emitConversationEvent(globalThis.portalIo,conversationId,"message:new",{conversationId,message});
  return mobileJson({success:true,data:{message}},201);
 }catch(error){if(uploadedKey)await voiceObject("delete",uploadedKey).catch(()=>{});return mobileApiError(error,"VOICE_UPLOAD_FAILED");}
}
