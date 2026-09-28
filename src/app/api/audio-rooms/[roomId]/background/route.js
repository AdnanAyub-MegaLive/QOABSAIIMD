import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { emitToAudioRoom } from "@/lib/realtime";
import { isSupportedRoomBackgroundMimeType, roomBackgroundError, serializeRoomBackground } from "@/lib/room-background";
import { requestOrigin } from "@/lib/user-perks";

export function OPTIONS() { return mobileOptions(); }

export async function PUT(request, { params }) {
  try {
    const user = await requireMobileUser(request);
    const { roomId: encodedRoomId } = await params;
    const roomId = decodeURIComponent(encodedRoomId);
    const body = await request.json();
    const assetId = body?.assetId == null ? null : String(body.assetId).trim();
    if (body?.assetId != null && !assetId) throw roomBackgroundError("VALIDATION_ERROR", "assetId must be a valid asset ID or null.");

    const room = await prisma.audioRoom.findUnique({ where: { roomId }, select: { id: true, roomId: true, ownerId: true } });
    if (!room) throw roomBackgroundError("ROOM_UNAVAILABLE");
    if (room.ownerId !== user.id) throw roomBackgroundError("ROOM_OWNER_REQUIRED");

    let asset = null;
    if (assetId) {
      const now = new Date();
      asset = await prisma.uploadAsset.findFirst({
        where: {
          publicId: assetId,
          category: "ROOM_BACKGROUNDS",
          active: true,
          OR: [
            { isGlobal: true },
            { assignments: { some: { userId: user.id, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } },
          ],
        },
        select: { id: true, publicId: true, mimeType: true, active: true },
      });
      if (!asset) throw roomBackgroundError("ROOM_BACKGROUND_UNAVAILABLE");
      if (!isSupportedRoomBackgroundMimeType(asset.mimeType)) throw roomBackgroundError("ROOM_BACKGROUND_TYPE_UNSUPPORTED");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.audioRoom.update({
        where: { id: room.id },
        data: { roomBackgroundAssetId: asset?.id ?? null, roomBackgroundVersion: { increment: 1 } },
        select: { roomId: true, ownerId: true, roomBackgroundVersion: true, roomBackgroundAsset: { select: { publicId: true, mimeType: true, active: true, isGlobal: true, assignments: { where: { userId: user.id }, select: { userId: true, expiresAt: true } } } } },
      });
      await tx.auditLog.create({
        data: {
          action: asset ? "AUDIO_ROOM_BACKGROUND_CHANGED" : "AUDIO_ROOM_BACKGROUND_RESET",
          category: "USER_MANAGEMENT",
          entityType: "AudioRoom",
          entityId: room.roomId,
          description: asset ? `Room owner ${user.publicId} selected background ${asset.publicId}.` : `Room owner ${user.publicId} restored the default background.`,
          metadata: { source: "MOBILE_APP", ownerId: user.publicId, assetId: asset?.publicId ?? null, version: next.roomBackgroundVersion },
        },
      });
      return next;
    });

    const background = serializeRoomBackground(updated, requestOrigin(request));
    const data = { roomId: room.roomId, background };
    emitToAudioRoom(room.roomId, "audio-room:background-changed", { success: true, data: { ...data, changedBy: { publicId: user.publicId } } });
    return mobileJson({ success: true, data });
  } catch (error) {
    if (error instanceof SyntaxError) return mobileJson({ success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, 400);
    console.error("Room background update failed", error);
    return mobileApiError(error, "ROOM_BACKGROUND_UPDATE_FAILED");
  }
}
