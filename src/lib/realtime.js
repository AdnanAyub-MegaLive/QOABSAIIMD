import { versionMediaPayload } from "./media-payload.js";
import { signalCacheForEvent } from "./cache-signal.js";
async function emitVersioned(channel,event,payload) {
  try { channel.emit(event,await versionMediaPayload(payload)); }
  catch(error) { console.error("Realtime media delivery failed",event,error); }
}
export async function emitToUser(publicId,event,payload) {
  if(globalThis.portalIo){await emitVersioned(globalThis.portalIo.to(`user:${publicId}`),event,payload);signalCacheForEvent(globalThis.portalIo,`user:${publicId}`,event,payload);}
}

export async function emitToAudioRoom(roomId,event,payload) {
  if(globalThis.portalIo)await emitVersioned(globalThis.portalIo.to(`audio-room:${roomId}`),event,payload);
}

export async function emitToVideoLive(liveId,event,payload) {
  if(globalThis.portalIo)await emitVersioned(globalThis.portalIo.to(`live-video:${liveId}`),event,payload);
}

export async function audioRoomParticipantIds(roomId) {
  const io = globalThis.portalIo;
  if (!io) throw new Error("Socket.IO is unavailable for room gift validation.");
  const sockets = await io.in(`audio-room:${roomId}`).fetchSockets();
  return new Set(sockets.map((socket) => socket.data.userId).filter(Boolean));
}

export async function emitToSockets(socketIds, event, payload) {
  if (globalThis.portalIo && socketIds.length) await emitVersioned(globalThis.portalIo.to(socketIds), event, payload);
}
