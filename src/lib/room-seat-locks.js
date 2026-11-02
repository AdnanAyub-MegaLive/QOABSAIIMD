const truthOrDareLayouts = new Set(['3,2,3,1', '3,3,3,3,1', '4,4,4,4,1']);

export function ownerCentreSeat(layout) {
  return Array.isArray(layout) && truthOrDareLayouts.has(layout.join(','))
    ? `row${layout.length - 1}-seat1` : null;
}

function ownerSeatIds(room) {
  return ['owner', '0', ownerCentreSeat(room.seatLayout)].filter(Boolean);
}

export function lockableRoomSeats(room) {
  return {
    audioRoomId: room.id,
    seatId: { notIn: ownerSeatIds(room) },
    ...(room.ownerId ? { OR: [{ occupantUserId: null }, { occupantUserId: { not: room.ownerId } }] } : {}),
  };
}

export async function unlockOwnerSeats(tx, room) {
  return tx.audioRoomSeat.updateMany({
    where: { audioRoomId: room.id, isLocked: true, OR: [
      { seatId: { in: ownerSeatIds(room) } },
      ...(room.ownerId ? [{ occupantUserId: room.ownerId }] : []),
    ] },
    data: { isLocked: false },
  });
}

export async function setRoomSeatLocks(db, room, locked, { seatId, note } = {}) {
  return db.$transaction(async tx => {
    // Layout writers update this same room row inside their transaction. Read
    // the layout after acquiring its lock, not from an earlier socket snapshot.
    await tx.$queryRaw`SELECT id FROM "AudioRoom" WHERE id = ${room.id} FOR UPDATE`;
    const current = await tx.audioRoom.findUniqueOrThrow({ where: { id: room.id }, select: { id: true, ownerId: true, seatLayout: true } });
    if (locked && seatId !== undefined) {
      const protectedSeat = ownerSeatIds(current).includes(seatId) || (current.ownerId && await tx.audioRoomSeat.findFirst({
        where: { audioRoomId: current.id, seatId, occupantUserId: current.ownerId }, select: { id: true },
      }));
      if (protectedSeat) throw Object.assign(new Error("The owner's seat cannot be locked."), { code: 'OWNER_SEAT_PROTECTED' });
    }
    const where = locked ? lockableRoomSeats(current) : { audioRoomId: current.id };
    if (seatId !== undefined) where.AND = [{ seatId }];
    const result = await tx.audioRoomSeat.updateMany({ where, data: { isLocked: locked, ...(note !== undefined ? { note } : {}) } });
    await unlockOwnerSeats(tx, current);
    return result;
  });
}
