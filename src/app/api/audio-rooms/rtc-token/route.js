import { audioRtcAccess } from "@/lib/rtc-access";
import { isRateLimited } from "@/lib/rate-limit";
import { rtcFields } from "@/lib/rtc-provider";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";

export const runtime = "nodejs";
export function OPTIONS() { return mobileOptions(); }
export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    if(isRateLimited(`audio-rtc-token:${user.id}`,{limit:30,windowMs:60000})){
      const response=mobileJson({success:false,error:{code:"RATE_LIMITED",message:"Too many audio credential requests. Retry shortly."}},429);
      response.headers.set("Retry-After","60");return response;
    }
    const body = await request.json();
    if (typeof body.roomId !== "string" || !body.roomId.trim()) throw new Error("VALIDATION_ERROR");
    return mobileJson({ success: true, data: rtcFields(await audioRtcAccess(user, body.roomId.trim())) });
  } catch (error) { return mobileApiError(error, "RTC_ACCESS_FAILED"); }
}
