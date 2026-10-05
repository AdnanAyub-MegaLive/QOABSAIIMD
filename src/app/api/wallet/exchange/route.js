import { exchangeDiamonds } from "@/lib/diamond-exchange";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
export const OPTIONS = mobileOptions;
export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    const body = await request.json();
    return mobileJson({ success: true, data: await exchangeDiamonds(user.id, body?.diamonds, request.headers.get("Idempotency-Key")) });
  } catch (error) {
    if (error instanceof SyntaxError) return mobileJson({ success: false, error: { code: "INVALID_JSON", message: "Invalid JSON body." } }, 400);
    return mobileApiError(error, "EXCHANGE_FAILED");
  }
}
