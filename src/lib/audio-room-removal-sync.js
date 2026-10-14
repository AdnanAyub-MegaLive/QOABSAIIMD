// Called only after the removed user's sockets have left the channel.
// Do not emit member-banned: existing clients turn that into a public kick message.
export async function syncAudioRoomRemoval(db, io, broadcastSeats, roomId, publicId, origin) {
  const room = await db.$transaction(async tx => {
    const locked = await tx.audioRoom.update({ where: { roomId }, data: { revision: { increment: 1 } } });
    const total = await tx.audioRoomMember.count({ where: { audioRoomId: locked.id, socketCount: { gt: 0 } } });
    return tx.audioRoom.update({ where: { id: locked.id }, data: { participantCount: total } });
  });
  await broadcastSeats(room, origin, room.participantCount, true);
  io.to(`audio-room:${roomId}`).emit("audio-room:member-left", {
    success: true,
    data: { roomId, revision: room.revision, total: room.participantCount, userId: publicId },
  });
  return room.revision;
}
