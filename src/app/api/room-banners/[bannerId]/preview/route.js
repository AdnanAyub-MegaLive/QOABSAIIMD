import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileApiError } from "@/lib/mobile-api";
import { portalPermissionError } from "@/lib/portal-admin";
import { bannerObject } from "@/lib/room-banner-media";
export async function GET(request, { params }) {
  try {
    const { bannerId } = await params;
    const banner = await prisma.roomBanner.findUnique({ where: { id: bannerId } });
    if (!banner) return new Response(null, { status: 404 });
    if (request.headers.get("authorization")) { const user = await requireMobileUser(request); if (user.id !== banner.ownerId) return new Response(null, { status: 403 }); }
    else { const denied = await portalPermissionError("appearance.view"); if (denied) return denied; }
    const object = await bannerObject("get", banner.storageKey);
    return new Response(await object.Body.transformToByteArray(), { headers: { "Content-Type": banner.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) { return mobileApiError(e, "BANNER_PREVIEW_FAILED"); }
}
