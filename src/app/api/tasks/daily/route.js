import { getDailyTasksOverview } from "@/lib/daily-tasks";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";

export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    return mobileJson({ success: true, data: await getDailyTasksOverview(user) });
  } catch (error) {
    console.error("Daily task overview failed", error);
    return mobileApiError(error, "DAILY_TASKS_FAILED");
  }
}
