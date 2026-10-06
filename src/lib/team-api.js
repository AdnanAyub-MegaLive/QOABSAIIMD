import { mobileApiError, mobileJson, requireMobileUser } from "./mobile-api";
import { withV1Request } from "./mobile-v1";
export function teamRequest(request, path, methods, work) {
  return withV1Request(request, { path, methods, rateLimit: { limit: request.method === "GET" ? 60 : 20, windowMs: 60000 } }, async () => {
    try { const user = await requireMobileUser(request); return mobileJson({ success: true, data: await work(user) }); }
    catch (error) {
      if ((error.code?.startsWith("TEAM_") || error.code === "MANAGEMENT_FORBIDDEN") && error.status) return mobileJson({ success: false, error: { code: error.code, message: error.message } }, error.status);
      if (error.code === "P2034") return mobileJson({ success: false, error: { code: "TEAM_CONFLICT", message: "The team changed concurrently. Refresh and retry." } }, 409);
      if (error instanceof SyntaxError) return mobileJson({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid JSON request." } }, 422);
      return mobileApiError(error, "TEAM_REQUEST_FAILED");
    }
  });
}
