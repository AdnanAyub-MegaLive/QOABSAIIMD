import {serializeRoomFrame} from "./room-frame.js";
export function roomCoverDto(room, origin) {
  const coverRevision = room.coverRevision ?? 0;
  const frame={roomFrame:serializeRoomFrame(room,origin),roomFrameVersion:room.roomFrameVersion??0};
  if (!room.coverImageUrl) return { ...frame, coverImageUrl: null, coverRevision };
  const url = new URL(room.coverImageUrl, origin);
  // Only version our own endpoint; do not break third-party signed URLs.
  if (url.pathname === `/api/audio-rooms/${room.roomId}/cover`) url.searchParams.set("v", String(coverRevision));
  return { ...frame, coverImageUrl: url.toString(), coverRevision };
}
