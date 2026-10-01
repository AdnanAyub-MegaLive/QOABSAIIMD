import { prisma } from "@/lib/prisma";
import mobileSession from "@/lib/mobile-session.cjs";
import { assertMobileSession, mobileSessionError } from "@/lib/mobile-session-state";
import { deviceMetadataInput, syncDeviceMetadata } from "@/lib/device-metadata";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
const headers = {
  "Access-Control-Allow-Origin": process.env.MOBILE_APP_ORIGIN || "*",
  "Access-Control-Allow-Methods": "PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store",
};
const json = (body, status = 200, extra = {}) => Response.json(body, { status, headers: { ...headers, ...extra } });
export function OPTIONS() { return new Response(null, { status: 204, headers }); }

export async function PUT(request) {
  let payload;
  try {
    const auth = request.headers.get("authorization");
    if (!/^Bearer\s+/i.test(auth ?? "")) throw new Error("INVALID_SESSION");
    payload = mobileSession.verifyMobileSessionToken(auth.replace(/^Bearer\s+/i, ""));
  } catch { return json(mobileSessionError(), 401); }
  try {
    const user = await prisma.user.findUnique({ where: { publicId: payload.userId } });
    assertMobileSession(user, payload);
    if (isRateLimited(`device-sync:${user.id}`, { limit: 10, windowMs: 60000 })) {
      return json({ success: false, error: { code: "RATE_LIMITED", message: "Too many device updates. Try again in a minute." } }, 429, { "Retry-After": "60" });
    }
    let body;
    try { body = await request.json(); }
    catch { return json({ success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, 400); }
    const input = deviceMetadataInput(body, request.headers);
    const data = await syncDeviceMetadata(prisma, payload, input);
    return json({ success: true, data });
  } catch (error) {
    if (["INVALID_SESSION", "SESSION_REVOKED"].includes(error.message)) return json(mobileSessionError(error.message), 401);
    if (error.status) return json({ success: false, error: { code: error.code, message: error.message } }, error.status);
    console.error("Device metadata synchronization failed", error);
    return json({ success: false, error: { code: "DEVICE_SYNC_FAILED", message: "Unable to update device details." } }, 500);
  }
}
