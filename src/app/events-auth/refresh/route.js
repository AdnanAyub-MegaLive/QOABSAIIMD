import {
  getRefreshCookie,
  rotateEventSession,
  setEventSessionCookies,
} from "../../../lib/events/auth.js";
import { eventErrorResponse, eventJson, EventModuleError } from "../../../lib/events/errors.js";
import { eventCookies } from "../../../lib/events/auth.js";

function cookieValue(request, name) {
  const header = request.headers.get("cookie") ?? "";
  const pair = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(pair.indexOf("=") + 1)) : "";
}

export async function POST(request) {
  try {
    const csrf = cookieValue(request, eventCookies.csrf);
    if (!csrf || request.headers.get("x-events-csrf") !== csrf)
      throw new EventModuleError("CSRF_INVALID", "The CSRF token is missing or invalid.", 403);
    const refresh = getRefreshCookie(request);
    if (!refresh)
      throw new EventModuleError("INVALID_REFRESH_TOKEN", "Refresh token is required.", 401);
    const session = await rotateEventSession(refresh);
    await setEventSessionCookies(session);
    return eventJson({ success: true, data: { refreshed: true } });
  } catch (error) {
    return eventErrorResponse(error, "EVENTS_REFRESH_FAILED");
  }
}
