import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";
import { emitToAudioRoom, emitToUser } from "@/lib/realtime";
export function OPTIONS() {
  return mobileOptions();
}
async function context(request, params) {
  const actor = await requireMobileUser(request);
  const { roomId, publicId } = await params;
  const room = await prisma.audioRoom.findUnique({
    where: { roomId: decodeURIComponent(roomId) },
    select: { id: true, roomId: true, ownerId: true },
  });
  if (!room) throw new Error("ROOM_UNAVAILABLE");
  if (room.ownerId !== actor.id) throw new Error("ROOM_OWNER_REQUIRED");
  const target = await prisma.user.findFirst({
    where: {
      publicId: decodeURIComponent(publicId),
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { id: true, publicId: true, name: true },
  });
  if (!target) throw new Error("USER_NOT_FOUND");
  if (target.id === room.ownerId)
    throw Object.assign(new Error("The room owner role cannot be changed."), {
      code: "VALIDATION_ERROR",
    });
  return { actor, room, target };
}
export async function PUT(request, { params }) {
  try {
    const { actor, room, target } = await context(request, params);
    const body = await request.json();
    if (String(body.role).toUpperCase() !== "ADMIN")
      throw Object.assign(
        new Error("Only the ADMIN role is currently supported."),
        { code: "VALIDATION_ERROR" },
      );
    const result = await prisma.$transaction(async (tx) => {
      await tx.audioRoomRole.upsert({
        where: {
          audioRoomId_userId: { audioRoomId: room.id, userId: target.id },
        },
        create: {
          audioRoomId: room.id,
          userId: target.id,
          grantedById: actor.id,
          role: "ADMIN",
        },
        update: { grantedById: actor.id, role: "ADMIN", grantedAt: new Date() },
      });
      const updated = await tx.audioRoom.update({
        where: { id: room.id },
        data: { revision: { increment: 1 } },
        select: { revision: true, updatedAt: true },
      });
      await tx.audioRoomModerationLog.create({
        data: {
          id: `MOD-${crypto.randomUUID()}`,
          audioRoomId: room.id,
          actorId: actor.id,
          targetId: target.id,
          action: "ROLE_GRANTED",
        },
      });
      return updated;
    });
    const data = {
      eventId: `EVT-${crypto.randomUUID()}`,
      roomId: room.roomId,
      userId: target.publicId,
      role: "ADMIN",
      permissions: {
        canModerateMembers: true,
        canManageSeats: true,
        canManageChat: true,
        canManagePrivacy: false,
        canManageMusic: false,
        canManageRoles: false,
      },
      revision: result.revision,
      updatedAt: result.updatedAt.toISOString(),
    };
    emitToAudioRoom(room.roomId, "audio-room:permissions-changed", {
      success: true,
      data,
    });
    emitToUser(target.publicId, "audio-room:permissions-changed", { success: true, data });
    return mobileJson({ success: true, data });
  } catch (e) {
    return mobileApiError(e, "ROOM_ROLE_UPDATE_FAILED");
  }
}
export async function DELETE(request, { params }) {
  try {
    const { actor, room, target } = await context(request, params);
    const result = await prisma.$transaction(async (tx) => {
      await tx.audioRoomRole.deleteMany({
        where: { audioRoomId: room.id, userId: target.id },
      });
      const updated = await tx.audioRoom.update({
        where: { id: room.id },
        data: { revision: { increment: 1 } },
        select: { revision: true, updatedAt: true },
      });
      await tx.audioRoomModerationLog.create({
        data: {
          id: `MOD-${crypto.randomUUID()}`,
          audioRoomId: room.id,
          actorId: actor.id,
          targetId: target.id,
          action: "ROLE_REVOKED",
        },
      });
      return updated;
    });
    const data = {
      eventId: `EVT-${crypto.randomUUID()}`,
      roomId: room.roomId,
      userId: target.publicId,
      role: "MEMBER",
      permissions: {
        canModerateMembers: false,
        canManageSeats: false,
        canManageChat: false,
        canManagePrivacy: false,
        canManageMusic: false,
        canManageRoles: false,
      },
      revision: result.revision,
      updatedAt: result.updatedAt.toISOString(),
    };
    emitToAudioRoom(room.roomId, "audio-room:permissions-changed", {
      success: true,
      data,
    });
    emitToUser(target.publicId, "audio-room:permissions-changed", { success: true, data });
    return mobileJson({ success: true, data });
  } catch (e) {
    return mobileApiError(e, "ROOM_ROLE_DELETE_FAILED");
  }
}
