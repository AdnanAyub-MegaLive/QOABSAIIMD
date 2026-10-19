import {prisma} from "@/lib/prisma";
import {mobileJson,mobileApiError,mobileOptions,requireMobileUser} from "@/lib/mobile-api";
import {changeRoomFrame} from "@/lib/room-frame";
import {requestOrigin} from "@/lib/user-perks";
import {emitToAudioRoom} from "@/lib/realtime";
export const OPTIONS=mobileOptions;
export async function PUT(request,{params}){
 try{
  const user=await requireMobileUser(request),{roomId}=await params,body=await request.json();
  if(!Object.hasOwn(body??{},"assetId"))return mobileJson({success:false,error:{code:"VALIDATION_ERROR",message:"Provide assetId or null."}},422);
  const data=await changeRoomFrame(prisma,user,roomId,body.assetId,requestOrigin(request));
  await emitToAudioRoom(roomId,"audio-room:frame-changed",{success:true,data});
  return mobileJson({success:true,data});
 }catch(error){
  if(error.status)return mobileJson({success:false,error:{code:error.code,message:error.message}},error.status);
  if(error instanceof SyntaxError)return mobileJson({success:false,error:{code:"INVALID_JSON",message:"Invalid JSON."}},400);
  return mobileApiError(error,"ROOM_FRAME_UPDATE_FAILED");
 }
}
