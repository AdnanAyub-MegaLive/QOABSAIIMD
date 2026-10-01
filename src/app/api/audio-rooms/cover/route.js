import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";
import { requestOrigin } from "@/lib/user-perks";
import { emitToAudioRoom } from "@/lib/realtime";

const maxImageSize = 10 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function OPTIONS() {
  return mobileOptions();
}

function validation(message, fields) {
  return mobileJson(
    {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message,
        ...(fields ? { fields } : {}),
      },
    },
    400,
  );
}

function validImageSignature(bytes, mime) {
  if (mime === "image/jpeg")
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  if (mime === "image/png")
    return (
      bytes.length >= 8 &&
      Buffer.from(bytes.subarray(0, 8)).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    );
  if (mime === "image/webp")
    return (
      bytes.length >= 12 &&
      Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
      Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
    );
  return false;
}

export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    let form;
    try {
      form = await request.formData();
    } catch {
      return validation("Request body must be multipart/form-data.");
    }
    const file = form.get("image");
    if (!(file instanceof File) || file.size <= 0)
      return validation("A room cover image is required.", {
        image: "Select an image.",
      });
    if (!allowedImageTypes.has(file.type))
      return validation("Image must be a JPEG, PNG, or WebP file.", {
        image: "Unsupported image type.",
      });
    if (file.size > maxImageSize)
      return mobileJson(
        {
          success: false,
          error: {
            code: "FILE_TOO_LARGE",
            message: "Room cover images cannot exceed 10 MB.",
          },
        },
        413,
      );

    const imageData = Buffer.from(await file.arrayBuffer());
    if (!validImageSignature(imageData, file.type))
      return validation("Image content does not match its file type.", {
        image: "Invalid image file.",
      });

    const room = await prisma.audioRoom.findUnique({
      where: { ownerId: user.id },
      select: { id: true, roomId: true },
    });
    if (!room)
      return mobileJson(
        {
          success: false,
          error: {
            code: "ROOM_NOT_FOUND",
            message: "Create a room before selecting its cover image.",
          },
        },
        404,
      );

    const coverImageUrl = `/api/audio-rooms/${room.roomId}/cover`;
    const [updated] = await prisma.$transaction([
      prisma.audioRoom.update({
        where: { id: room.id },
        data: {
          coverImageData: imageData,
          coverImageMime: file.type,
          coverImageUrl,
          revision: { increment: 1 },
        },
        select: { revision: true },
      }),
      prisma.auditLog.create({
        data: {
          action: "AUDIO_ROOM_COVER_UPDATED",
          category: "USER_MANAGEMENT",
          entityType: "AudioRoom",
          entityId: room.roomId,
          description: `User ${user.publicId} updated the cover image for audio room ${room.roomId}`,
          metadata: {
            source: "MOBILE_APP",
            ownerId: user.publicId,
            mimeType: file.type,
            fileSize: file.size,
          },
        },
      }),
    ]);

    const resolvedCoverImageUrl = new URL(coverImageUrl, requestOrigin(request)).toString();
    emitToAudioRoom(room.roomId, "audio-room:updated", {
      success: true,
      data: { roomId: room.roomId, coverImageUrl: resolvedCoverImageUrl, revision: updated.revision },
    });
    return mobileJson({
      success: true,
      data: {
        roomId: room.roomId,
        coverImageUrl: resolvedCoverImageUrl,
        revision: updated.revision,
      },
    });
  } catch (error) {
    console.error("Audio room cover upload failed", error);
    return mobileApiError(error, "ROOM_COVER_UPLOAD_FAILED");
  }
}
