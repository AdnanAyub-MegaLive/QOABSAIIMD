import { audioRtcAccess } from "@/lib/rtc-access";
import { rtcFields } from "@/lib/rtc-provider";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";

export const runtime = "nodejs";
export function OPTIONS() { return mobileOptions(); }
export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    const body = await request.json();
    if (typeof body.roomId !== "string" || !body.roomId.trim()) throw new Error("VALIDATION_ERROR");
    return mobileJson({ success: true, data: rtcFields(await audioRtcAccess(user, body.roomId.trim())) });
  } catch (error) { return mobileApiError(error, "RTC_ACCESS_FAILED"); }
}
