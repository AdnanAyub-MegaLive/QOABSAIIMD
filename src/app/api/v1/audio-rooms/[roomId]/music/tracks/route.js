import { fileTypeFromBuffer } from "file-type";
import { requireRoomPermission } from "@/lib/audio-room-management";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { serializeCatalogTrack, validateRoomMusicUpload } from "@/lib/music-catalog";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/user-perks";

export function OPTIONS() {
  return mobileOptions();
}

async function authorizedRoom(request, params) {
  const user = await requireMobileUser(request);
  const { roomId } = await params;
  const room = await prisma.audioRoom.findUnique({ where: { roomId: decodeURIComponent(roomId) }, select: { id: true, roomId: true, ownerId: true } });
  if (!room) throw new Error("ROOM_UNAVAILABLE");
  await requireRoomPermission(room, user.id, "canManageMusic");
  return { room, user };
}

const trackSelect = { publicId: true, name: true, details: true, mimeType: true, tags: true, updatedAt: true };

function trackDto(asset, origin) {
  const track = serializeCatalogTrack(asset, origin);
  const durationTag = asset.tags.find((tag) => tag.startsWith("duration:"));
  const durationSeconds = Number(durationTag?.slice("duration:".length));
  return { ...track, durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null };
}

export async function GET(request, { params }) {
  try {
    const { room } = await authorizedRoom(request, params);
    const tracks = await prisma.uploadAsset.findMany({
      where: { audioRoomId: room.id, category: "MUSIC_TRACKS", isGlobal: false, active: true },
      select: trackSelect,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { publicId: "asc" }],
      take: 500,
    });
    const origin = requestOrigin(request);
    return mobileJson({ success: true, data: { roomId: room.roomId, tracks: tracks.map((track) => trackDto(track, origin)) } });
  } catch (error) {
    return mobileApiError(error, "ROOM_MUSIC_CATALOG_FAILED");
  }
}

export async function POST(request, { params }) {
  try {
    const { room, user } = await authorizedRoom(request, params);
    const form = await request.formData();
    const file = form.get("file");
    const title = String(form.get("title") ?? "").trim();
    const artist = String(form.get("artist") ?? "").trim().slice(0, 160) || null;
    if (!(file instanceof File) || !file.size || !title || title.length > 160) throw Object.assign(new Error("A music file and title of at most 160 characters are required."), { code: "VALIDATION_ERROR" });
    const bytes = Buffer.from(await file.arrayBuffer());
    const detected = await fileTypeFromBuffer(bytes);
    const validated = validateRoomMusicUpload({ size: file.size, declaredMimeType: file.type, detectedMimeType: detected?.mime, durationSeconds: form.get("durationSeconds") });
    const publicId = `AST-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const tags = validated.durationSeconds ? [`duration:${validated.durationSeconds}`] : [];
    const asset = await prisma.$transaction(async (tx) => {
      const created = await tx.uploadAsset.create({
        data: { publicId, name: title, details: artist, tags, category: "MUSIC_TRACKS", fileName: file.name.slice(0, 255), mimeType: validated.mimeType, fileSize: file.size, fileData: bytes, audioRoomId: room.id, isGlobal: false, distribution: "MANUAL", storeVisible: false, active: true },
        select: trackSelect,
      });
      await tx.auditLog.create({ data: { action: "ROOM_MUSIC_TRACK_UPLOADED", category: "AUDIO_ROOM", entityType: "UploadAsset", entityId: publicId, description: `${user.publicId} uploaded ${title} to ${room.roomId}.`, metadata: { roomId: room.roomId, mimeType: validated.mimeType, fileSize: file.size } } });
      return created;
    });
    return mobileJson({ success: true, data: { roomId: room.roomId, track: trackDto(asset, requestOrigin(request)) } }, 201);
  } catch (error) {
    return mobileApiError(error, "ROOM_MUSIC_UPLOAD_FAILED");
  }
}
