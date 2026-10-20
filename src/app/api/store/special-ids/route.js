import { prisma } from "@/lib/prisma";
import { mobileJson, mobileApiError, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { occupiedSpecialId, purchaseSpecialId } from "@/lib/special-id-commerce";
import { isRateLimited } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
export function OPTIONS() { return mobileOptions(); }
export async function GET(request) {
  try {
    await requireMobileUser(request);
    const params = new URL(request.url).searchParams;
    const cursor = params.get("cursor");
    const items = await prisma.specialIdDefinition.findMany({
      where: { active: true, storeVisible: true, coinPrice: { gt: 0 }, assignments: { none: occupiedSpecialId(new Date()) }, ...(cursor ? { code: { gt: cursor } } : {}) },
      orderBy: { code: "asc" }, take: 51,
      select: { id: true, code: true, coinPrice: true, defaultDurationMinutes: true },
    });
    return mobileJson({ success: true, data: { items: items.slice(0, 50).map(item => ({ id: item.id, code: item.code, coinPrice: item.coinPrice.toString(), durationMinutes: item.defaultDurationMinutes })), nextCursor: items.length > 50 ? items[49].code : null } });
  } catch (error) { return mobileApiError(error, "SPECIAL_ID_CATALOG_FAILED"); }
}
export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    if (isRateLimited(`special-id-purchase:${user.id}`, { limit: 20, windowMs: 60000 }))
      return mobileJson({ success: false, error: { code: "RATE_LIMITED", message: "Try again in a minute." } }, 429);
    let body;
    try { body = await request.json(); } catch { return mobileJson({ success: false, error: { code: "VALIDATION_ERROR", message: "Provide valid JSON." } }, 422); }
    const data = await purchaseSpecialId(prisma, user.id, body?.definitionId, request.headers.get("Idempotency-Key"));
    globalThis.portalScheduleSpecialIdExpiry?.(data.assignmentId, new Date(data.expiresAt));
    return mobileJson({ success: true, data });
  } catch (error) {
    if (error.status) return mobileJson({ success: false, error: { code: error.code, message: error.message } }, error.status);
    return mobileApiError(error, "SPECIAL_ID_PURCHASE_FAILED");
  }
}
