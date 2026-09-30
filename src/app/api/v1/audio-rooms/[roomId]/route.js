import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";
import { requireRoomPermission } from "@/lib/audio-room-management";
import { emitToAudioRoom } from "@/lib/realtime";
import { ensureAudioRoomSeats, normalizeAudioRoomSeatLayout, readAudioRoomSeatState } from "@/lib/audio-room-seats";
import { requestOrigin } from "@/lib/user-perks";
export function OPTIONS() {
  return mobileOptions();
}
export async function PATCH(request, { params }) {
  try {
    const actor = await requireMobileUser(request),
      { roomId } = await params,
      body = await request.json();
    const room = await prisma.audioRoom.findUnique({
      where: { roomId: decodeURIComponent(roomId) },
      select: { id: true, roomId: true, ownerId: true, privacyMode: true, paidEntryCoins: true, seatLayout: true },
    });
    if (!room) throw new Error("ROOM_UNAVAILABLE");
    await requireRoomPermission(room, actor.id, "canManagePrivacy");
    const data = {};
    if ("announcement" in body) {
      const v = String(body.announcement ?? "").trim();
      if (v.length > 300)
        throw Object.assign(
          new Error("Announcement must not exceed 300 characters."),
          { code: "VALIDATION_ERROR" },
        );
      data.announcement = v || null;
    }
    if ("language" in body) {
      const v = String(body.language ?? "")
        .trim()
        .toLowerCase();
      if (v && !/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(v))
        throw Object.assign(
          new Error("Language must be a valid language code."),
          { code: "VALIDATION_ERROR" },
        );
      data.language = v || null;
    }
    if ("tags" in body) {
      if (!Array.isArray(body.tags) || body.tags.length > 3)
        throw Object.assign(new Error("Provide at most three room tags."), {
          code: "VALIDATION_ERROR",
        });
      data.tags = [
        ...new Set(body.tags.map((v) => String(v).trim()).filter(Boolean)),
      ];
      if (data.tags.some((v) => v.length > 30))
        throw Object.assign(
          new Error("Room tags must not exceed 30 characters."),
          { code: "VALIDATION_ERROR" },
        );
    }
    if ("privacyMode" in body) {
      const v = String(body.privacyMode).toUpperCase();
      if (!["PUBLIC", "HIDDEN", "PASSWORD", "PAID"].includes(v))
        throw Object.assign(
          new Error("Privacy mode must be PUBLIC, HIDDEN, PASSWORD, or PAID."),
          { code: "VALIDATION_ERROR" },
        );
      data.privacyMode = v;
    }
    if ("paidEntryCoins" in body) {
      const v =
        body.paidEntryCoins == null
          ? null
          : BigInt(String(body.paidEntryCoins));
      if (v !== null && v < 1n)
        throw Object.assign(new Error("Paid entry coins must be positive."), {
          code: "VALIDATION_ERROR",
        });
      data.paidEntryCoins = v;
    }
    if ("seatLayout" in body)
      data.seatLayout = normalizeAudioRoomSeatLayout(body.seatLayout);
    const nextPrivacyMode = data.privacyMode ?? room.privacyMode;
    const nextPaidEntryCoins = data.paidEntryCoins === undefined ? room.paidEntryCoins : data.paidEntryCoins;
    if (nextPrivacyMode === "PAID" && (!nextPaidEntryCoins || nextPaidEntryCoins < 1n))
      throw Object.assign(new Error("paidEntryCoins is required when privacyMode is PAID."), { code: "VALIDATION_ERROR" });
    const updated = await prisma.audioRoom.update({
      where: { id: room.id },
      data: { ...data, revision: { increment: 1 } },
      select: {
        roomId: true,
        announcement: true,
        language: true,
        tags: true,
        privacyMode: true,
        paidEntryCoins: true,
        revision: true,
        seatLayout: true,
        updatedAt: true,
      },
    });
    const result = {
      ...updated,
      paidEntryCoins: updated.paidEntryCoins?.toString() ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    };
    emitToAudioRoom(room.roomId, "audio-room:updated", {
      success: true,
      data: result,
    });
    if (data.seatLayout) {
      await ensureAudioRoomSeats(room.id, data.seatLayout);
      const seatState = await readAudioRoomSeatState({ ...room, ...updated }, requestOrigin(request));
      emitToAudioRoom(room.roomId, "audio-room:seat-update", { success: true, data: { ...seatState, seatLayout: data.seatLayout } });
    }
    return mobileJson({ success: true, data: { room: result } });
  } catch (e) {
    return mobileApiError(e, "ROOM_UPDATE_FAILED");
  }
}
