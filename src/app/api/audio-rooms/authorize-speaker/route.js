import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";
import {
  issueLiveKitAccess,
  setLiveKitPublishPermission,
} from "@/lib/livekit-speaker-authorization";
import { readAudioRoomSeatState } from "@/lib/audio-room-seats";
import { requestOrigin } from "@/lib/user-perks";

export const runtime = "nodejs";

export function OPTIONS() {
  return mobileOptions();
}

async function changeAuthorization(request, forcedAuthorization) {
  try {
    const owner = await requireMobileUser(request);
    const body = await request.json().catch(() => ({}));
    const roomId = String(body?.roomId ?? "").trim();
    const speakerId = String(body?.speakerId ?? "").trim();
    const authorized =
      forcedAuthorization ??
      (body?.authorized === undefined
        ? true
        : body.authorized === true || body.authorized === "true");

    if (!roomId || !speakerId) {
      return mobileJson(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "roomId and speakerId are required.",
          },
        },
        400,
      );
    }

    const room = await prisma.audioRoom.findUnique({
      where: { roomId },
      select: {
        id: true,
        roomId: true,
        ownerId: true,
        status: true,
        isBlocked: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!room || room.status !== "LIVE" || room.isBlocked) {
      return mobileJson(
        { success: false, error: { code: "ROOM_UNAVAILABLE" } },
        404,
      );
    }
    if (room.ownerId !== owner.id) {
      return mobileJson(
        {
          success: false,
          error: {
            code: "OWNER_REQUIRED",
            message: "Only the room owner can authorize speakers.",
          },
        },
        403,
      );
    }
    if (speakerId === owner.publicId) {
      return mobileJson(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "The room owner already has publish permission.",
          },
        },
        400,
      );
    }

    const speaker = await prisma.user.findFirst({
      where: { publicId: speakerId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, publicId: true, name: true },
    });
    if (!speaker) {
      return mobileJson(
        { success: false, error: { code: "SPEAKER_NOT_FOUND" } },
        404,
      );
    }

    if (authorized && globalThis.portalIo) {
      const speakerSockets = await globalThis.portalIo
        .in(`user:${speaker.publicId}`)
        .fetchSockets();
      const isInRoom = speakerSockets.some((socket) =>
        socket.rooms.has(`audio-room:${roomId}`),
      );
      if (!isInRoom) {
        return mobileJson(
          {
            success: false,
            error: {
              code: "SPEAKER_NOT_IN_ROOM",
              message: "The selected speaker is not connected to this room.",
            },
          },
          409,
        );
      }
    }

    const occupiedSeat = await prisma.audioRoomSeat.findFirst({
      where: { audioRoomId: room.id, occupantUserId: speaker.id },
      select: { seatId: true },
    });
    if (authorized && !occupiedSeat) {
      return mobileJson(
        {
          success: false,
          error: {
            code: "SPEAKER_NOT_SEATED",
            message: "Only a currently seated user can publish audio.",
          },
        },
        409,
      );
    }
    if (!authorized && occupiedSeat) {
      await prisma.audioRoomSeat.updateMany({
        where: { audioRoomId: room.id, occupantUserId: speaker.id },
        data: {
          occupantUserId: null,
          occupiedAt: null,
          isMuted: true,
          isSpeaking: false,
        },
      });
    }

    const liveKitPermissionUpdated = await setLiveKitPublishPermission(
      roomId,
      speaker.publicId,
      authorized,
    );
    await prisma.auditLog.create({
      data: {
        action: authorized
          ? "AUDIO_ROOM_SPEAKER_AUTHORIZED"
          : "AUDIO_ROOM_SPEAKER_REVOKED",
        category: "USER_MANAGEMENT",
        entityType: "AudioRoom",
        entityId: roomId,
        description: `${owner.name} ${authorized ? "authorized" : "revoked"} LiveKit publishing for ${speaker.publicId} in room ${roomId}.`,
        metadata: {
          ownerId: owner.publicId,
          speakerId: speaker.publicId,
          seatId: occupiedSeat?.seatId ?? null,
          liveKitPermissionUpdated,
        },
      },
    });
    const seatState = await readAudioRoomSeatState(room, requestOrigin(request));
    globalThis.portalIo
      ?.to(`audio-room:${roomId}`)
      .emit("audio-room:seat-update", { success: true, data: seatState });

    return mobileJson({
      success: true,
      data: {
        roomId,
        speakerId: speaker.publicId,
        authorized,
        seatId: occupiedSeat?.seatId ?? null,
        seatState,
        liveKit: await issueLiveKitAccess(speaker, roomId, authorized),
      },
    });
  } catch (error) {
    console.error("LiveKit speaker authorization failed", error);
    return mobileApiError(error, "SPEAKER_AUTHORIZATION_FAILED");
  }
}

export function POST(request) {
  return changeAuthorization(request);
}

export function DELETE(request) {
  return changeAuthorization(request, false);
}
