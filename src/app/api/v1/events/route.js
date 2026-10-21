import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from "@/lib/mobile-api";
import { requestOrigin } from "@/lib/user-perks";
export const dynamic = "force-dynamic";
export function OPTIONS() { return mobileOptions(); }
export async function GET(request) {
  try {
    await requireMobileUser(request);
    const rows = await prisma.event.findMany({ where: { status: "PUBLISHED" }, orderBy: [{ publishedAt: "desc" }, { publicId: "asc" }], select: { publicId: true, name: true, slug: true } });
    const origin = requestOrigin(request);
    return mobileJson({ success: true, data: { events: rows.map(row => ({ ...row, bannerUrl: null, startsAt: null, endsAt: null, url: new URL(`/event/${encodeURIComponent(row.slug)}`, origin).toString() })) } });
  } catch (error) { return mobileApiError(error, "EVENTS_LIST_FAILED"); }
}
