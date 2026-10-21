import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from "@/lib/mobile-api";
import { bannerSettings, ownerBanner, roomBannerSnapshot, submitBanner, changeBanner, reorderBanners, editBannerText } from "@/lib/room-banners";
import { bannerError, bannerForm, decodeBanner } from "@/lib/room-banner-media";
import { isRateLimited } from "@/lib/rate-limit";
import { activeRoomBan } from "@/lib/audio-room-management";
import { assertUsersCanInteract } from "@/lib/user-blocks";
export const runtime = "nodejs";
export function OPTIONS() { return mobileOptions(); }
function fail(e) { return e.status ? mobileJson({ success: false, error: { code: e.code, message: e.message } }, e.status) : mobileApiError(e, "ROOM_BANNERS_FAILED"); }
async function context(request, params, ownerOnly = true) {
  const user = await requireMobileUser(request), { roomId } = await params;
  const room = await prisma.audioRoom.findUnique({ where: { roomId } });
  if (!room || (ownerOnly && room.ownerId !== user.id)) throw bannerError("ROOM_OWNER_ONLY", "Only the room owner can manage banners.", 403);
  return { user, roomId, room };
}
export async function GET(request, { params }) {
  try {
    const { user, roomId, room } = await context(request, params, false);
    if (room.ownerId !== user.id) {
      if (await activeRoomBan(room.id, user.id)) throw bannerError("ROOM_BANNED", "You cannot access this room.", 403);
      await assertUsersCanInteract(room.ownerId, user.id);
      const member = await prisma.audioRoomMember.findUnique({ where: { audioRoomId_userId: { audioRoomId: room.id, userId: user.id } } });
      if (!member?.socketCount || room.isBlocked || room.status !== "LIVE") throw bannerError("JOIN_ROOM_FIRST", "Join the room to view its banners.", 403);
      return mobileJson({ success: true, data: await roomBannerSnapshot(roomId) });
    }
    const [settings, rows, snapshot] = await Promise.all([bannerSettings(), prisma.roomBanner.findMany({ where: { audioRoomId: room.id }, orderBy: { createdAt: "desc" }, take: 100 }), roomBannerSnapshot(roomId)]);
    return mobileJson({ success: true, data: { settings, ...snapshot, items: rows.map(b => ownerBanner(b.status === "ACTIVE" && b.expiresAt <= new Date() ? { ...b, status: "EXPIRED" } : b)) } });
  } catch (e) { return fail(e); }
}
export async function POST(request, { params }) {
  try {
    const { user, roomId } = await context(request, params);
    if (isRateLimited(`banner-upload:${user.id}`, { limit: 10, windowMs: 3600000 })) throw bannerError("RATE_LIMITED", "Wait before uploading another banner.", 429);
    const form = await bannerForm(request), file = form.get("image");
    if (!(file instanceof File) || form.getAll("image").length !== 1) throw bannerError("INVALID_BANNER", "Provide one image.");
    const media = await decodeBanner(Buffer.from(await file.arrayBuffer()), file.type);
    const banner = await submitBanner({ roomId, userId: user.id, requestId: request.headers.get("Idempotency-Key") || form.get("requestId"), packageId: form.get("packageId"), settingsRevision: Number(form.get("settingsRevision")), media, name: form.get("name"), description: form.get("description") ?? "" });
    return mobileJson({ success: true, data: { banner } }, 201);
  } catch (e) { return fail(e); }
}
export async function DELETE(request, { params }) {
  try { const { user, roomId } = await context(request, params); const { bannerId } = await request.json(); return mobileJson({ success: true, data: { banner: await changeBanner({ roomId, id: bannerId, action: "DELETE", userId: user.id }) } }); } catch (e) { return fail(e); }
}
export async function PATCH(request, { params }) {
  try {
    const { user, roomId } = await context(request, params), body = await request.json();
    if (body.action === "EDIT_TEXT") return mobileJson({ success: true, data: { banner: await editBannerText({ roomId, id: body.bannerId, userId: user.id, name: body.name, description: body.description }) } });
    await reorderBanners(roomId, user.id, body.bannerIds);
    return mobileJson({ success: true, data: await roomBannerSnapshot(roomId) });
  } catch (e) { return fail(e); }
}
