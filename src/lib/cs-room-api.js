import { prisma } from "./prisma.js";
import { mobileApiError, mobileJson, requireMobileUser } from "./mobile-api.js";
import { withV1Request } from "./mobile-v1.js";
import { isRateLimited } from "./rate-limit.js";
import { avatarDisplayUrl } from "./avatar-history.js";
import { requestOrigin } from "./user-perks.js";
import { rtcProvider } from "./rtc-provider.js";
import { issueTrtcAccess } from "./trtc-authorization.js";
import { csRoomsSnapshot, csRtcRoomId, sweepCsRooms } from "./cs-rooms.js";

export function csRoomRequest(request, path, methods, work) {
  return withV1Request(request, { path, methods }, async () => {
    try {
      const user = await requireMobileUser(request);
      if (isRateLimited(`cs-room:${user.id}`, { limit: 90, windowMs: 60000 })) return mobileJson({ success: false, error: { code: "RATE_LIMITED", message: "Please wait before trying again." } }, 429);
      return mobileJson({ success: true, data: await work(user) });
    } catch (error) {
      if ((error.code?.startsWith("CS_") || error.code === "VALIDATION_ERROR") && error.status) return mobileJson({ success: false, error: { code: error.code, message: error.message } }, error.status);
      if (error instanceof SyntaxError) return mobileJson({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid JSON request." } }, 422);
      return mobileApiError(error, "CS_ROOM_FAILED");
    }
  });
}

export async function csRoomState(request, user, country = null, withRtc = false) {
  await sweepCsRooms(prisma);
  const origin = requestOrigin(request);
  const snapshot = await csRoomsSnapshot(prisma, user, (value) => avatarDisplayUrl(value, origin));
  if (!withRtc || !country) return snapshot;
  let trtc = null;
  try {
    if (rtcProvider() === "TRTC") trtc = issueTrtcAccess(user, csRtcRoomId(country), snapshot.mySeat?.country === country);
  } catch {
    trtc = null;
  }
  return { ...snapshot, trtc };
}
