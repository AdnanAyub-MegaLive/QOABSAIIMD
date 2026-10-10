import { trtc } from "tencentcloud-sdk-nodejs-trtc";
import { rtcProvider } from "./rtc-provider.js";
import { prisma } from "./prisma.js";
import { activeRoomBan } from "./audio-room-management.js";
import { permissionTransitions } from "./rtc-permission-transitions.js";
const transitions = permissionTransitions();
import { removeLiveKitParticipant, updateLiveKitPublishPermission } from "./livekit-authorization.js";

async function removeTrtcParticipant(roomId, userId) {
  const secretId = process.env.TENCENT_CLOUD_SECRET_ID;
  const secretKey = process.env.TENCENT_CLOUD_SECRET_KEY;
  if (!secretId || !secretKey) throw new Error("TRTC_CLOUD_NOT_CONFIGURED");
  const client = new trtc.v20190722.Client({
    credential: { secretId, secretKey }, region: process.env.TRTC_REGION || "ap-singapore",
    profile: { httpProfile: { endpoint: "trtc.intl.tencentcloudapi.com", reqTimeout: 10 } },
  });
  try {
    await client.RemoveUserByStrRoomId({ SdkAppId: Number(process.env.TRTC_SDK_APP_ID), RoomId: String(roomId), UserIds: [String(userId)] });
  } catch (error) {
    // Never pass provider exceptions (which may contain request metadata) to callers/logs.
    console.error("TRTC participant removal failed", { code: error?.code, requestId: error?.requestId });
    throw new Error("RTC_MODERATION_FAILED");
  }
  return { configured: true, removed: true };
}

export async function removeRtcParticipant(roomId, userId) {
  transitions.forget(`${rtcProvider()}:${roomId}:${userId}`);
  return rtcProvider() === "TRTC" ? removeTrtcParticipant(roomId, userId) : removeLiveKitParticipant(roomId, userId);
}

export async function updateRtcPublishPermission(roomId, userId, canPublish) {
  return transitions.run(`${rtcProvider()}:${roomId}:${userId}`, async () => {
    if(!canPublish)return false;
    const room=await prisma.audioRoom.findUnique({where:{roomId},select:{id:true,status:true,isBlocked:true,ownerId:true}});
    // Video rooms retain their separate guest authorization path.
    if(!room)return true;
    const user=await prisma.user.findUnique({where:{publicId:userId},select:{id:true,status:true,deletedAt:true}});
    if(!user||user.status!=="ACTIVE"||user.deletedAt||room.isBlocked||!["LIVE","IDLE"].includes(room.status))return false;
    if(await activeRoomBan(room.id,user.id))return false;
    const sockets=await globalThis.portalIo?.in(`user:${userId}`).fetchSockets();
    if(!sockets?.some(socket=>socket.rooms.has(`audio-room:${roomId}`)))return false;
    const seat=await prisma.audioRoomSeat.findFirst({where:{audioRoomId:room.id,occupantUserId:user.id}});
    return seat ? !seat.isForceMuted&&!seat.isMuted : room.ownerId===user.id;
  }, async effective => {
  canPublish=effective;
  if (rtcProvider() === "LIVEKIT") return updateLiveKitPublishPermission(roomId, userId, canPublish);
  // TRTC has no LiveKit-style updateParticipant permission mutation. Evict on
  // downgrade; the client must fetch a fresh role ticket from authoritative state.
  if (!canPublish) await removeTrtcParticipant(roomId, userId);
  globalThis.portalIo?.to(`user:${userId}`).emit("rtc:credentials-invalidated", {
    success: true, data: { provider: "TRTC", roomId, reconnect: !canPublish },
  });
  return { configured: true, updated: true };
  });
}
