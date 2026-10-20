import { decorationMedia } from "./decoration-media.js";
import { publicCdnUrl } from "./media-cdn-policy.js";
export const roomFrameAssetSelect = {
 id:true, publicId:true, category:true, mimeType:true, active:true, mediaVersion:true, cdnUrl:true,
 isGlobal:true,storeVisible:true,audioRoomId:true,
 posterMimeType:true, posterMediaVersion:true, posterCdnUrl:true,
 assignments:{select:{userId:true,expiresAt:true}},
};
export const roomFrameInclude = {roomFrameAsset:{select:roomFrameAssetSelect}};
export function serializeRoomFrame(room,origin,now=new Date()) {
 const asset=room?.roomFrameAsset;
 const owned=asset?.assignments?.some(a=>a.userId===room.ownerId&&(!a.expiresAt||new Date(a.expiresAt)>now));
 if(!asset?.active||asset.category!=="ROOM_FRAMES"||!owned)return null;
 const media=decorationMedia(asset,origin);
 return {...media,posterUrl:publicCdnUrl(asset,true)??media.posterUrl,version:room.roomFrameVersion??0};
}
export async function changeRoomFrame(db,user,roomId,assetId,origin) {
 const fail=(code,status,message)=>{throw Object.assign(new Error(message),{code,status});};
 if(assetId!==null&&(typeof assetId!=="string"||!assetId.trim()||assetId.length>100))fail("VALIDATION_ERROR",422,"Provide assetId or null.");
 return db.$transaction(async tx=>{
  const room=await tx.audioRoom.findUnique({where:{roomId}});
  if(!room)fail("ROOM_UNAVAILABLE",404,"Room is unavailable.");
  if(room.ownerId!==user.id)fail("ROOM_OWNER_REQUIRED",403,"Only the room owner may change its frame.");
  const asset=assetId?await tx.uploadAsset.findFirst({where:{publicId:assetId,category:"ROOM_FRAMES",active:true,assignments:{some:{userId:user.id,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}}},select:{id:true}}):null;
  if(assetId&&!asset)fail("PROP_NOT_OWNED",403,"An active, owned Room Frame is required.");
  const updated=await tx.audioRoom.update({where:{id:room.id},data:{roomFrameAssetId:asset?.id??null,roomFrameVersion:{increment:1}},include:roomFrameInclude});
  await tx.auditLog.create({data:{action:"AUDIO_ROOM_FRAME_CHANGED",category:"USER_MANAGEMENT",entityType:"AudioRoom",entityId:roomId,description:"Room owner changed the cover frame.",metadata:{actorPublicId:user.publicId,actorUserId:user.id,outcome:"SUCCESS",before:{assetId:room.roomFrameAssetId??null,version:room.roomFrameVersion??0},after:{assetId,version:updated.roomFrameVersion}}}});
  return {roomId,roomFrame:serializeRoomFrame(updated,origin),roomFrameVersion:updated.roomFrameVersion};
 },{isolationLevel:"Serializable"});
}
