import "server-only";

export function emitToUser(publicId,event,payload) {
  globalThis.portalIo?.to(`user:${publicId}`).emit(event,payload);
}

export function emitToAudioRoom(roomId,event,payload) {
  globalThis.portalIo?.to(`audio-room:${roomId}`).emit(event,payload);
}

export function emitToVideoLive(liveId,event,payload) {
  globalThis.portalIo?.to(`live-video:${liveId}`).emit(event,payload);
}

export async function audioRoomParticipantIds(roomId) {
  const io = globalThis.portalIo;
  if (!io) throw new Error("Socket.IO is unavailable for room gift validation.");
  const sockets = await io.in(`audio-room:${roomId}`).fetchSockets();
  return new Set(sockets.map((socket) => socket.data.userId).filter(Boolean));
}
