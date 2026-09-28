import { prisma } from "../../../lib/prisma";
import { requireMobileUser } from "../../../lib/mobile-api";
import { reconcileExpiredAudioRoomRestrictions } from "../../../lib/audio-room-maintenance";
import { ensureAudioRoomSeats } from "../../../lib/audio-room-seats";
import {
  requestOrigin,
  resolveUserPerks,
} from "../../../lib/user-perks";
import { generateNumericPublicId } from "../../../lib/public-id";
import { serializeRoomBackground } from "../../../lib/room-background";
import { serializeRoomSeatStyle } from "../../../lib/room-seat-style";

const roomBackgroundInclude = {
  roomBackgroundAsset: {
    select: {
      publicId: true,
      mimeType: true,
      active: true,
      isGlobal: true,
      assignments: { select: { userId: true, expiresAt: true } },
    },
  },
  seatStyleAsset: {
    select: { publicId: true, mimeType: true, active: true, isGlobal: true, assignments: { select: { userId: true, expiresAt: true } } },
  },
};

const cors = {
  "Access-Control-Allow-Origin": process.env.MOBILE_APP_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (body, status = 200) =>
  Response.json(body, { status, headers: cors });
const optional = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

async function authenticatedUser(request) {
  return requireMobileUser(request);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET(request) {
  try {
    const user = await authenticatedUser(request);
    const origin = requestOrigin(request);
    await reconcileExpiredAudioRoomRestrictions();
    const room = await prisma.audioRoom.findUnique({
      where: { ownerId: user.id },
      include: roomBackgroundInclude,
    });
    const perks = (
      await resolveUserPerks([user], origin)
    ).get(user.publicId);
    return json({
      success: true,
      data: {
        room: room ? serializeRoom(room, perks, origin) : null,
        rooms: room ? [serializeRoom(room, perks, origin)] : [],
      },
    });
  } catch {
    return json(
      {
        success: false,
        error: {
          code: "INVALID_SESSION",
          message: "The mobile session is invalid or expired.",
        },
      },
      401,
    );
  }
}

export async function POST(request) {
  try {
    const user = await authenticatedUser(request);
    const origin = requestOrigin(request);
    const perks = (
      await resolveUserPerks([user], origin)
    ).get(user.publicId);
    await reconcileExpiredAudioRoomRestrictions();
    const body = await request.json();
    const action = String(body?.action ?? "START")
      .trim()
      .toUpperCase();
    let existing = await prisma.audioRoom.findUnique({
      where: { ownerId: user.id },
      include: roomBackgroundInclude,
    });

    if (["EXIT", "EMPTY", "END"].includes(action)) {
      if (!existing)
        return json(
          {
            success: false,
            error: {
              code: "ROOM_NOT_FOUND",
              message: "This user does not have an assigned room.",
            },
          },
          404,
        );
      const room = await makeRoomIdle(existing, body);
      await writeAudit(
        user,
        "AUDIO_ROOM_EMPTIED",
        room.roomId,
        `User ${user.publicId} ended audio room ${room.roomId}`,
      );
      return json({
        success: true,
        data: {
          room: serializeRoom(room, perks, origin),
          roomId: room.roomId,
          reused: true,
        },
      });
    }

    if (!["START", "CREATE", "UPDATE"].includes(action))
      return json(
        {
          success: false,
          error: {
            code: "INVALID_ACTION",
            message: "Use START, CREATE, UPDATE, EXIT, EMPTY or END.",
          },
        },
        422,
      );
    if (existing?.isBlocked)
      return json(
        {
          success: false,
          error: {
            code: "ROOM_BLOCKED",
            message: "This room has been blocked by an administrator.",
            details: {
              reason: existing.blockedReason,
              expiresAt: existing.blockedUntil?.toISOString() ?? null,
            },
          },
        },
        403,
      );
    if (existing?.status === "TERMINATED")
      return json(
        {
          success: false,
          error: {
            code: "ROOM_TERMINATED",
            message:
              "This room has been temporarily terminated by an administrator.",
            details: {
              expiresAt: existing.terminatedUntil?.toISOString() ?? null,
            },
          },
        },
        403,
      );
    const title = String(
      body?.title ?? existing?.title ?? `${user.name}'s Room`,
    ).trim();
    if (title.length < 2 || title.length > 120)
      return json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Room title must contain 2 to 120 characters.",
          },
        },
        422,
      );

    const now = new Date();
    const data = {
      title,
      country: user.country ?? existing?.country ?? null,
      status: "LIVE",
      liveAudioUrl: validUrl(body.liveAudioUrl),
      recordingUrl:
        validUrl(body.recordingUrl) ?? existing?.recordingUrl ?? null,
      participantCount: Math.max(0, Number(body.participantCount) || 0),
      startedAt: now,
      endedAt: null,
    };
    const created = !existing;
    const roomId = existing?.roomId ?? await generateNumericPublicId(
      "ROOM",
      async (candidate) => prisma.audioRoom.findUnique({
        where: { roomId: candidate },
        select: { id: true },
      }),
    );
    existing = await prisma.audioRoom.upsert({
      where: { ownerId: user.id },
      update: data,
      create: {
        roomId,
        ownerId: user.id,
        ...data,
        country: user.country ?? null,
      },
      include: roomBackgroundInclude,
    });
    await ensureAudioRoomSeats(existing.id);
    await writeAudit(
      user,
      created ? "AUDIO_ROOM_ID_ASSIGNED" : "AUDIO_ROOM_RESTARTED",
      existing.roomId,
      created
        ? `System assigned audio room ${existing.roomId} to user ${user.publicId}`
        : `User ${user.publicId} restarted assigned audio room ${existing.roomId}`,
    );
    return json(
      {
        success: true,
        data: {
          room: serializeRoom(existing, perks, origin),
          roomId: existing.roomId,
          reused: !created,
        },
      },
      created ? 201 : 200,
    );
  } catch (error) {
    if (error instanceof SyntaxError)
      return json(
        {
          success: false,
          error: {
            code: "INVALID_JSON",
            message: "Request body must be valid JSON.",
          },
        },
        400,
      );
    if (error.message === "INVALID_SESSION")
      return json(
        {
          success: false,
          error: {
            code: "INVALID_SESSION",
            message: "The mobile session is invalid or expired.",
          },
        },
        401,
      );
    console.error("Audio room request failed", error);
    return json(
      {
        success: false,
        error: {
          code: "AUDIO_ROOM_REQUEST_FAILED",
          message: "Unable to process the room request.",
        },
      },
      500,
    );
  }
}

async function makeRoomIdle(room, body = {}) {
  return prisma.$transaction(async (tx) => {
    await tx.audioRoomSeat.updateMany({
      where: { audioRoomId: room.id },
      data: {
        occupantUserId: null,
        occupiedAt: null,
        isMuted: true,
        isSpeaking: false,
      },
    });
    await tx.audioRoomMember.updateMany({ where: { audioRoomId: room.id }, data: { socketCount: 0, lastSeenAt: new Date() } });
    return tx.audioRoom.update({
      where: { id: room.id },
      data: {
        status: "IDLE",
        participantCount: 0,
        liveAudioUrl: null,
        recordingUrl: validUrl(body.recordingUrl) ?? room.recordingUrl,
        endedAt: new Date(),
      },
      include: roomBackgroundInclude,
    });
  });
}
async function writeAudit(user, action, roomId, description) {
  return prisma.auditLog.create({
    data: {
      action,
      category: "USER_MANAGEMENT",
      entityType: "AudioRoom",
      entityId: roomId,
      description,
      metadata: {
        source: "MOBILE_APP",
        ownerId: user.publicId,
        persistentRoomId: true,
      },
    },
  });
}
function validUrl(value) {
  const text = optional(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? text : null;
  } catch {
    return null;
  }
}
function serializeRoom(room, perks, origin) {
  return {
    roomId: room.roomId,
    title: room.title,
    country: room.country ?? null,
    status: room.status,
    liveAudioUrl: room.liveAudioUrl,
    recordingUrl: room.recordingUrl,
    coverImageUrl: room.coverImageUrl
      ? new URL(room.coverImageUrl, origin).toString()
      : null,
    roomBackground: serializeRoomBackground(room, origin),
    seatStyle: serializeRoomSeatStyle(room, origin),
    participantCount: room.participantCount,
    isLocked: Boolean(room.passwordHash),
    chatLocked: Boolean(room.chatLocked),
    announcement: room.announcement ?? null,
    language: room.language ?? null,
    tags: room.tags ?? [],
    privacyMode: room.privacyMode ?? "PUBLIC",
    paidEntryCoins: room.paidEntryCoins?.toString() ?? null,
    revision: room.revision ?? 0,
    joiningDisabled: room.joiningDisabled,
    joiningDisabledUntil: room.joiningDisabledUntil?.toISOString() ?? null,
    isBlocked: room.isBlocked,
    blockedReason: room.blockedReason,
    blockedUntil: room.blockedUntil?.toISOString() ?? null,
    terminatedUntil: room.terminatedUntil?.toISOString() ?? null,
    startedAt: room.startedAt.toISOString(),
    endedAt: room.endedAt?.toISOString() ?? null,
    updatedAt: room.updatedAt.toISOString(),
  };
}
