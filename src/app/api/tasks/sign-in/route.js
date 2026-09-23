import { claimDailyTask } from "@/lib/daily-tasks";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";

export function OPTIONS() {
  return mobileOptions();
}

export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    const body = await request.json();
    const result = await claimDailyTask(user.id, body?.taskId, "SIGN_IN");
    return mobileJson({ success: true, data: result });
  } catch (error) {
    console.error("Daily sign-in claim failed", error);
    return mobileApiError(error, "SIGN_IN_CLAIM_FAILED");
  }
}
