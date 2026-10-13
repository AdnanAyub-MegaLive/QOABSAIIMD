import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileApiError } from "@/lib/mobile-api";
import { withV1Request, v1Json, v1Options } from "@/lib/mobile-v1";
import { verifyGoogleIdToken } from "@/lib/google-sso";
import { hashPassword } from "@/lib/password";
import { connectionStatus, connectionCountries, connectionError } from "@/lib/account-connection-policy";
import { consumeConnectionRequest, linkGoogle, requestPhoneConnection, confirmPhoneConnection } from "@/lib/account-connections";

export const runtime = "nodejs";
const methods = "GET, POST, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
async function handle(request, context) {
  const action = ((await context.params).action || []).join("/");
  return withV1Request(request, { path: `/api/v1/users/me/connections/${action}`, methods, rateLimit: { limit: 60, windowMs: 60000 } }, async ({ requestId }) => {
    try {
      const user = await requireMobileUser(request);
      let data;
      if (request.method === "GET" && !action) {
        data = connectionStatus(await prisma.user.findUniqueOrThrow({ where: { id: user.id } }));
      } else if (request.method === "GET" && action === "countries") {
        data = { countries: connectionCountries() };
      } else if (request.method === "POST" && ["google", "phone/request", "phone/confirm"].includes(action)) {
        await consumeConnectionRequest(prisma, user);
        let input;
        try { input = await request.json(); } catch { throw connectionError("INVALID_JSON", "Provide a valid JSON body.", 400); }
        if (!input || typeof input !== "object" || Array.isArray(input)) throw connectionError("VALIDATION_ERROR", "Provide an object.");
        if (action === "google") data = await linkGoogle(prisma, user, await verifyGoogleIdToken(input.idToken));
        else if (action === "phone/request") data = await requestPhoneConnection(prisma, user, input);
        else data = await confirmPhoneConnection(prisma, user, input, hashPassword);
      } else throw connectionError("NOT_FOUND", "Connection endpoint not found.", 404);
      return v1Json(request, requestId, { success: true, data }, 200, methods);
    } catch (error) {
      if (error.code?.startsWith("GOOGLE_") && !error.status) error.status = error.code === "GOOGLE_SSO_NOT_CONFIGURED" ? 503 : error.code === "GOOGLE_ID_TOKEN_REQUIRED" ? 422 : 401;
      if (error.status) {
        const response = v1Json(request, requestId, { success: false, error: { code: error.code, message: error.message } }, error.status, methods);
        if (error.status === 429) response.headers.set("Retry-After", "600");
        return response;
      }
      return mobileApiError(error, "CONNECTION_FAILED");
    }
  });
}
export const GET = handle;
export const POST = handle;
