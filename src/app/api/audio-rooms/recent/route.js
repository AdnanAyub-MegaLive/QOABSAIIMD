import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { reconcileExpiredAudioRoomRestrictions } from "@/lib/audio-room-maintenance";
import { visitPageOptions, visitCursor, recentRoomWhere } from "@/lib/audio-room-visits";
import { requestOrigin, resolveUserPerks } from "@/lib/user-perks";
import { avatarDisplayUrl } from "@/lib/avatar-history";
import { serializeRoomBackground } from "@/lib/room-background";
import { serializeRoomSeatStyle } from "@/lib/room-seat-style";

export const OPTIONS = mobileOptions;
const artwork = { select: { publicId: true, mimeType: true, active: true, isGlobal: true, assignments: { select: { userId: true, expiresAt: true } } } };

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const { limit, cursor } = visitPageOptions(new URL(request.url).searchParams);
    await reconcileExpiredAudioRoomRestrictions();
    const rows = await prisma.audioRoomVisit.findMany({
      where: recentRoomWhere(user.id, cursor),
      orderBy: [{ lastVisitedAt: "desc" }, { audioRoomId: "desc" }], take: limit + 1,
      select: { audioRoomId: true, lastVisitedAt: true, audioRoom: { select: {
        roomId: true, title: true, coverImageUrl: true, ownerId: true, status: true, participantCount: true,
        privacyMode: true, passwordHash: true, paidEntryCoins: true,
        roomBackgroundVersion: true, roomBackgroundAsset: artwork, seatStyleVersion: true, seatStyleAsset: artwork,
        owner: { select: { id: true, publicId: true, name: true, profileImage: true } },
      } } },
    });
    const page = rows.slice(0, limit), origin = requestOrigin(request);
    const perks = await resolveUserPerks(page.map(row => row.audioRoom.owner), origin, ["FRAMES", "BADGES"]);
    return mobileJson({ success: true, data: {
      rooms: page.map(({ lastVisitedAt, audioRoom: room }) => ({
        roomId: room.roomId, title: room.title,
        coverImageUrl: room.coverImageUrl ? new URL(room.coverImageUrl, origin).toString() : null,
        status: room.status, participantCount: room.participantCount, lastVisitedAt: lastVisitedAt.toISOString(),
        privacyMode: room.privacyMode, isLocked: Boolean(room.passwordHash), paidEntryCoins: room.paidEntryCoins?.toString() ?? null,
        roomBackground: serializeRoomBackground(room, origin), seatStyle: serializeRoomSeatStyle(room, origin),
        owner: { publicId: room.owner.publicId, name: room.owner.name, profileImage: avatarDisplayUrl(room.owner.profileImage, origin), frameUrl: perks.get(room.owner.publicId)?.frameUrl ?? null, badgeUrl: perks.get(room.owner.publicId)?.badgeUrl ?? null },
      })),
      nextCursor: rows.length > limit ? visitCursor(page[page.length - 1]) : null,
    } });
  } catch (error) {
    console.error("Recent room history failed", error);
    return mobileApiError(error, "ROOM_HISTORY_FAILED");
  }
}
