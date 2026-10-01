import {
  clearEventSessionCookies,
  getRefreshCookie,
  requireEventUser,
  revokeEventSession,
} from "../../../lib/events/auth.js";
import { eventErrorResponse, eventJson } from "../../../lib/events/errors.js";
import { writeEventLog } from "../../../lib/events/logger.js";
import { requestIp } from "../../../lib/events/request.js";

export async function POST(request) {
  try {
    const user = await requireEventUser(request, { csrf: true });
    await revokeEventSession(getRefreshCookie(request));
    await clearEventSessionCookies();
    await writeEventLog({ userId: user.id, action: "LOGOUT", ip: requestIp(request) });
    return eventJson({ success: true, data: { loggedOut: true } });
  } catch (error) {
    await clearEventSessionCookies();
    return eventErrorResponse(error, "EVENTS_LOGOUT_FAILED");
  }
}
