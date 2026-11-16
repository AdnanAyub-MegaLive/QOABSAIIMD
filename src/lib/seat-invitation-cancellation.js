// Compare-and-set shares the PENDING gate with invite acceptance. No accepted
// invitation can be cancelled, and repeat cancellation requests are harmless.
export async function cancelSeatInvitation(db, room, invitationId, now = new Date()) {
  const invitation = await db.audioRoomSeatInvitation.findUnique({
    where: { id: invitationId },
    include: { target: { select: { publicId: true } }, inviter: { select: { publicId: true } } },
  });
  if (!invitation || invitation.audioRoomId !== room.id) throw Object.assign(new Error("SEAT_INVITATION_NOT_FOUND"), { code: "SEAT_INVITATION_NOT_FOUND" });
  if (invitation.status !== "CANCELLED") {
    const changed = await db.audioRoomSeatInvitation.updateMany({
      where: { id: invitationId, audioRoomId: room.id, status: "PENDING" },
      data: { status: "CANCELLED", respondedAt: now },
    });
    if (!changed.count) throw Object.assign(new Error("SEAT_INVITATION_RESOLVED"), { code: "SEAT_INVITATION_RESOLVED" });
  }
  return { invitation, data: { roomId: room.roomId, invitationId, seatId: invitation.seatId, status: "CANCELLED" } };
}
