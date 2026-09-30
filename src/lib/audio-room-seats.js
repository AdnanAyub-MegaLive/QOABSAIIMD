import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { resolveUserPerks } from "./user-perks.js";

export const defaultAudioRoomSeatLayout = [3, 4, 4];
export const maxAudioRoomSeats = 20;

export function normalizeAudioRoomSeatLayout(value, { optional = false } = {}) {
  if (value == null && optional) return null;
  const layout = value == null ? defaultAudioRoomSeatLayout : value;
  if (!Array.isArray(layout) || layout.length < 1 || layout.length > 6)
    throw Object.assign(new Error("Seat layout must contain 1 to 6 rows."), { code: "VALIDATION_ERROR" });
  const normalized = layout.map(Number);
  if (normalized.some((count) => !Number.isSafeInteger(count) || count < 1 || count > 5))
    throw Object.assign(new Error("Every seat row must contain 1 to 5 seats."), { code: "VALIDATION_ERROR" });
  if (normalized.reduce((total, count) => total + count, 0) > maxAudioRoomSeats)
    throw Object.assign(new Error(`A room cannot contain more than ${maxAudioRoomSeats} seats.`), { code: "VALIDATION_ERROR" });
  return normalized;
}

export function audioRoomSeatIds(layout = defaultAudioRoomSeatLayout) {
  return normalizeAudioRoomSeatLayout(layout).flatMap((count, row) =>
    Array.from({ length: count }, (_, seat) => `row${row}-seat${seat + 1}`),
  );
}

export const defaultAudioRoomSeatIds = audioRoomSeatIds();

export async function ensureAudioRoomSeats(audioRoomId, layout = defaultAudioRoomSeatLayout) {
  const seatIds = audioRoomSeatIds(layout);
  await prisma.audioRoomSeat.createMany({
    data: seatIds.map((seatId) => ({ audioRoomId, seatId })),
    skipDuplicates: true,
  });
  return seatIds;
}

function publicOccupant(user, perks) {
  if (!user) return null;
  return {
    publicId: user.publicId,
    name: user.name,
    profileImage: user.profileImage ?? null,
    frameUrl: perks?.frameUrl ?? null,
    badgeUrl: perks?.badgeUrl ?? null,
    businessCardUrl: perks?.businessCardUrl ?? null,
    businessCardPosterUrl: perks?.businessCardPosterUrl ?? null,
    businessCardMimeType: perks?.businessCardMimeType ?? null,
    isOfficial: Boolean(user.isOfficial),
  };
}

export async function readAudioRoomSeatState(room, origin) {
  const seatLayout = normalizeAudioRoomSeatLayout(room.seatLayout);
  const seatIds = await ensureAudioRoomSeats(room.id, seatLayout);
  const [seats, revision] = await Promise.all([
    prisma.audioRoomSeat.findMany({
      where: { audioRoomId: room.id, seatId: { in: seatIds } },
      include: {
        occupant: {
          select: {
            id: true,
            publicId: true,
            name: true,
            profileImage: true,
            isOfficial: true,
          },
        },
      },
      orderBy: { seatId: "asc" },
    }),
    prisma.audioRoom.findUnique({
      where: { id: room.id },
      select: { seatRevision: true },
    }),
  ]);
  const occupants = seats.map((seat) => seat.occupant).filter(Boolean);
  const perks = await resolveUserPerks(occupants, origin, ["FRAMES", "BADGES", "BUSINESS_CARD"]);
  const rows = new Map();
  let updatedAt = room.updatedAt ?? room.createdAt ?? new Date();
  for (const seat of seats) {
    const match = /^row(\d+)-seat\d+$/.exec(seat.seatId);
    const rowIndex = Number(match?.[1] ?? 0);
    if (!rows.has(rowIndex)) rows.set(rowIndex, []);
    rows.get(rowIndex).push({
      id: seat.seatId,
      locked: seat.isLocked,
      occupied: Boolean(seat.occupant),
      occupant: publicOccupant(
        seat.occupant,
        seat.occupant ? perks.get(seat.occupant.publicId) : null,
      ),
      note: seat.note ?? null,
      muted: seat.occupant ? seat.isMuted : true,
      forceMuted: seat.occupant ? seat.isForceMuted : false,
      forceMutedUntil: seat.occupant ? seat.forceMutedUntil?.toISOString() ?? null : null,
      speaking: seat.occupant ? seat.isSpeaking : false,
    });
    if (seat.updatedAt > updatedAt) updatedAt = seat.updatedAt;
  }
  return {
    roomId: room.roomId,
    revision: revision?.seatRevision ?? room.seatRevision ?? 0,
    seatLayout,
    seatRows: [...rows.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, row]) => row),
    updatedAt: updatedAt.toISOString(),
  };
}

export async function advanceAudioRoomSeatRevision(audioRoomId) {
  return prisma.audioRoom.update({
    where: { id: audioRoomId },
    data: { seatRevision: { increment: 1 } },
    select: { seatRevision: true },
  });
}

export async function moveAudioRoomMember(room, targetUserId, toSeatId, { allowLocked = false } = {}) {
  await ensureAudioRoomSeats(room.id, room.seatLayout);
  return serializableSeatTransaction(async (tx) => {
    const target = await tx.audioRoomSeat.findUnique({
      where: { audioRoomId_seatId: { audioRoomId: room.id, seatId: toSeatId } },
    });
    if (!target) throw new Error("SEAT_NOT_FOUND");
    if (target.isLocked && !allowLocked) throw new Error("SEAT_LOCKED");
    if (target.occupantUserId && target.occupantUserId !== targetUserId)
      throw new Error("SEAT_OCCUPIED");
    await tx.audioRoomSeat.updateMany({
      where: {
        audioRoomId: room.id,
        occupantUserId: targetUserId,
        id: { not: target.id },
      },
      data: {
        occupantUserId: null,
        occupiedAt: null,
        isMuted: true,
        isForceMuted: false,
        forceMutedUntil: null,
        isSpeaking: false,
      },
    });
    return tx.audioRoomSeat.update({
      where: { id: target.id },
      data: {
        occupantUserId: targetUserId,
        occupiedAt:
          target.occupantUserId === targetUserId
            ? target.occupiedAt
            : new Date(),
        isMuted: true,
        isForceMuted: false,
        forceMutedUntil: null,
        isSpeaking: false,
      },
    });
  });
}

async function serializableSeatTransaction(operation) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (error?.code !== "P2034" || attempt === 2) throw error;
    }
  }
}

export async function takeAudioRoomSeat(room, userId, seatId) {
  await ensureAudioRoomSeats(room.id, room.seatLayout);
  return serializableSeatTransaction(async (tx) => {
    const target = await tx.audioRoomSeat.findUnique({
      where: { audioRoomId_seatId: { audioRoomId: room.id, seatId } },
    });
    if (!target) throw new Error("SEAT_NOT_FOUND");
    if (target.isLocked) throw new Error("SEAT_LOCKED");
    if (target.occupantUserId && target.occupantUserId !== userId)
      throw new Error("SEAT_OCCUPIED");
    if (target.occupantUserId === userId) return target;

    await tx.audioRoomSeat.updateMany({
      where: { audioRoomId: room.id, occupantUserId: userId },
      data: {
        occupantUserId: null,
        occupiedAt: null,
        isMuted: true,
        isForceMuted: false,
        forceMutedUntil: null,
        isSpeaking: false,
      },
    });
    const assigned = await tx.audioRoomSeat.updateMany({
      where: {
        id: target.id,
        occupantUserId: null,
        isLocked: false,
      },
      data: {
        occupantUserId: userId,
        occupiedAt: new Date(),
        isMuted: true,
        isForceMuted: false,
        forceMutedUntil: null,
        isSpeaking: false,
      },
    });
    if (!assigned.count) throw new Error("SEAT_OCCUPIED");
    return tx.audioRoomSeat.findUnique({ where: { id: target.id } });
  });
}

export async function moveAudioRoomSeat(room, userId, fromSeatId, toSeatId) {
  await ensureAudioRoomSeats(room.id, room.seatLayout);
  return serializableSeatTransaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.audioRoomSeat.findUnique({
        where: {
          audioRoomId_seatId: { audioRoomId: room.id, seatId: fromSeatId },
        },
      }),
      tx.audioRoomSeat.findUnique({
        where: {
          audioRoomId_seatId: { audioRoomId: room.id, seatId: toSeatId },
        },
      }),
    ]);
    if (!source || source.occupantUserId !== userId)
      throw new Error("SOURCE_SEAT_NOT_OWNED");
    if (!target) throw new Error("SEAT_NOT_FOUND");
    if (target.isLocked) throw new Error("SEAT_LOCKED");
    if (target.occupantUserId) throw new Error("SEAT_OCCUPIED");

    await tx.audioRoomSeat.update({
      where: { id: source.id },
      data: {
        occupantUserId: null,
        occupiedAt: null,
        isMuted: true,
        isForceMuted: false,
        forceMutedUntil: null,
        isSpeaking: false,
      },
    });
    const moved = await tx.audioRoomSeat.updateMany({
      where: { id: target.id, occupantUserId: null, isLocked: false },
      data: {
        occupantUserId: userId,
        occupiedAt: new Date(),
        isMuted: source.isMuted,
        isForceMuted: source.isForceMuted,
        isSpeaking: false,
      },
    });
    if (!moved.count) throw new Error("SEAT_OCCUPIED");
    return tx.audioRoomSeat.findUnique({ where: { id: target.id } });
  });
}

export async function leaveAudioRoomSeat(roomId, userId, seatId = null) {
  const where = { audioRoomId: roomId, occupantUserId: userId };
  if (seatId) where.seatId = seatId;
  return prisma.audioRoomSeat.updateMany({
    where,
    data: {
      occupantUserId: null,
      occupiedAt: null,
      isMuted: true,
      isForceMuted: false,
      forceMutedUntil: null,
      isSpeaking: false,
    },
  });
}

export function seatErrorPayload(error) {
  const code = error?.message;
  const messages = {
    SEAT_NOT_FOUND: "The selected seat does not exist.",
    SEAT_LOCKED: "The selected seat is locked.",
    SEAT_OCCUPIED: "The selected seat is already occupied.",
    SOURCE_SEAT_NOT_OWNED: "You do not occupy the source seat.",
  };
  return {
    code: messages[code] ? code : "SEAT_OPERATION_FAILED",
    message: messages[code] ?? "Unable to update the seat right now.",
  };
}
