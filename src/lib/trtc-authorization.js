import tls from "tls-sig-api-v2";
import { rtcProvider } from "./rtc-provider.js";

export function trtcConfiguration() {
  if (rtcProvider() !== "TRTC") throw new Error("RTC_PROVIDER_DISABLED");
  const sdkAppId = Number(process.env.TRTC_SDK_APP_ID);
  const secret = String(process.env.TRTC_SECRET_KEY || "").trim();
  if (!Number.isSafeInteger(sdkAppId) || sdkAppId <= 0 || !secret) throw new Error("TRTC_NOT_CONFIGURED");
  // This is an operator assertion, not a way to enable Tencent's console setting.
  if (process.env.TRTC_ADVANCED_PERMISSION_ENABLED !== "true") throw new Error("TRTC_PERMISSION_SETUP_REQUIRED");
  if (!process.env.TENCENT_CLOUD_SECRET_ID || !process.env.TENCENT_CLOUD_SECRET_KEY) throw new Error("TRTC_CLOUD_NOT_CONFIGURED");
  const ttlSeconds = Math.min(600, Math.max(60, Number(process.env.TRTC_TOKEN_TTL_SECONDS) || 300));
  return { sdkAppId, secret, ttlSeconds: Math.floor(ttlSeconds) };
}

export function issueTrtcAccess(user, roomId, canPublish, { video = false } = {}) {
  const { sdkAppId, secret, ttlSeconds } = trtcConfiguration();
  const userId = String(user.publicId || "");
  const strRoomId = String(roomId || "");
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(userId) || !/^[A-Za-z0-9_-]{1,64}$/.test(strRoomId)) throw new Error("RTC_INVALID_IDENTITY");
  const api = new tls.Api(sdkAppId, secret);
  const privilegeMap = 1 | 2 | 8 | (video ? 32 : 0) | (canPublish ? 4 | (video ? 16 : 0) : 0);
  return {
    provider: "TRTC", sdkAppId, userId, strRoomId,
    userSig: api.genUserSig(userId, ttlSeconds),
    privateMapKey: api.genPrivateMapKeyWithStringRoomID(userId, ttlSeconds, strRoomId, privilegeMap),
    role: canPublish ? "ANCHOR" : "AUDIENCE", appScene: video ? "LIVE" : "VOICE_CHATROOM",
    canPublish: Boolean(canPublish), expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
}
