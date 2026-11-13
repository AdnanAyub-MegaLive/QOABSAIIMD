import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError } from "@/lib/mobile-api";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
import { isRateLimited } from "@/lib/rate-limit";
import { listUserSpecialIds, selectUserSpecialId } from "@/lib/special-id-ownership";

export const dynamic = "force-dynamic";
const options = { path: "/api/v1/users/me/special-ids", methods: "GET, POST, OPTIONS" };
async function handle(request, write) {
  const response = await withV1Request(request, options, async () => {
    try {
      const user = await requireMobileUser(request);
      if (isRateLimited(`special-id-${write ? "use" : "read"}:${user.id}`, { limit: write ? 20 : 30, windowMs: 60000 }))
        return mobileJson({ success: false, error: { code: "RATE_LIMITED", message: "Try again shortly." } }, 429);
      if (!write) return mobileJson({ success: true, data: { items: await listUserSpecialIds(prisma, user.id) } });
      const body = await request.json().catch(() => null);
      if (body?.action !== "USE" || typeof body.assignmentId !== "string" || !body.assignmentId || body.assignmentId.length > 128)
        return mobileJson({ success: false, error: { code: "VALIDATION_ERROR", message: "Provide assignmentId and action USE." } }, 422);
      return mobileJson({ success: true, data: await selectUserSpecialId(prisma, user.id, body.assignmentId) });
    } catch (error) {
      if (error.status) return mobileJson({ success: false, error: { code: error.code, message: error.message } }, error.status);
      return mobileApiError(error, "SPECIAL_IDS_FAILED");
    }
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const GET = request => handle(request, false);
export const POST = request => handle(request, true);
export const OPTIONS = request => v1Options(request, options.methods);
