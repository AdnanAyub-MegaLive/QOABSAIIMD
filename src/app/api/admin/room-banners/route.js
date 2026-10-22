import { prisma } from "@/lib/prisma";
import { reviewPage } from "@/lib/review-pagination";
import { portalPermissionError, requirePortalAdmin } from "@/lib/portal-admin";
import { bannerSettings, ownerBanner, validateBannerSettings, changeBanner, editBannerText } from "@/lib/room-banners";
const json = data => Response.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
function fail(e) { console.error("Room banner admin operation failed", e.code ?? e.name); return Response.json({ success: false, error: { code: e.code ?? "ROOM_BANNERS_FAILED", message: e.status ? e.message : "Unable to update room banners." } }, { status: e.status ?? 500 }); }
export async function GET(request) {
  const denied = await portalPermissionError("appearance.view"); if (denied) return denied;
  try {
    const params = new URL(request.url).searchParams, status = params.get("status") ?? "PENDING";
    if (!["ALL", "PENDING", "ACTIVE", "REJECTED", "DELETED", "EXPIRED"].includes(status)) throw Object.assign(new Error("Invalid banner status."), { status: 422, code: "VALIDATION_ERROR" });
    const page = reviewPage(params, `banners:${status}`, "createdAt", status === "PENDING" ? "asc" : "desc");
    const rows = await prisma.roomBanner.findMany({ where: { AND: [status === "ALL" ? {} : { status }, page.after] }, include: { room: { select: { roomId: true, title: true } }, owner: { select: { publicId: true, name: true } } }, orderBy: page.orderBy, take: page.take });
    const result = page.result(rows);
    return json({ settings: await bannerSettings(), ...result, items: result.items.map(b => ({ ...ownerBanner(b), room: b.room, owner: b.owner })) });
  } catch (e) { return fail(e); }
}
export async function PATCH(request) {
  const denied = await portalPermissionError("appearance.manage"); if (denied) return denied;
  try {
    const actor = await requirePortalAdmin(), body = await request.json();
    if (body.action === "SETTINGS") {
      const data = validateBannerSettings(body);
      await prisma.$transaction(async tx => {
        await tx.roomBannerSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data, revision: 1 }, update: { ...data, revision: { increment: 1 } } });
        await tx.auditLog.create({ data: { adminId: actor.id, action: "ROOM_BANNER_SETTINGS", category: "CONTENT_MANAGEMENT", entityType: "RoomBannerSettings", entityId: "default", description: "Updated paid room banner settings", metadata: data } });
      }); return json(await bannerSettings());
    }
    if (body.action === "EDIT_TEXT") return json({ banner: await editBannerText({ roomId: body.roomId, id: body.bannerId, adminId: actor.id, name: body.name, description: body.description }) });
    return json({ banner: await changeBanner({ roomId: body.roomId, id: body.bannerId, action: body.action, reason: body.reason, adminId: actor.id }) });
  } catch (e) { return fail(e); }
}
