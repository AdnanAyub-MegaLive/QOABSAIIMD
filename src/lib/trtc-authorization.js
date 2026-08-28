import { createHmac } from "node:crypto";
import { deflateSync } from "node:zlib";

const USER_SIG_TTL_SECONDS = 60 * 60;
const TRTC_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

function trtcConfiguration() {
  const sdkAppId = Number(process.env.TRTC_SDK_APP_ID);
  const secretKey = String(process.env.TRTC_SECRET_KEY ?? "").trim();
  if (!Number.isSafeInteger(sdkAppId) || sdkAppId <= 0 || !secretKey) {
    throw new Error("TRTC_NOT_CONFIGURED");
  }
  return { sdkAppId, secretKey };
}

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "*")
    .replace(/\//g, "-")
    .replace(/=/g, "_");
}

function userSig({ sdkAppId, secretKey, userId, expiresIn, userBuf = null }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const userBufBase64 = userBuf ? Buffer.from(userBuf).toString("base64") : null;
  const signed = [
    `TLS.identifier:${userId}`,
    `TLS.sdkappid:${sdkAppId}`,
    `TLS.time:${issuedAt}`,
    `TLS.expire:${expiresIn}`,
    ...(userBufBase64 ? [`TLS.userbuf:${userBufBase64}`] : []),
    "",
  ].join("\n");
  const signature = createHmac("sha256", secretKey).update(signed).digest("base64");
  const document = {
    "TLS.ver": "2.0",
    "TLS.identifier": userId,
    "TLS.sdkappid": sdkAppId,
    "TLS.time": issuedAt,
    "TLS.expire": expiresIn,
    ...(userBufBase64 ? { "TLS.userbuf": userBufBase64 } : {}),
    "TLS.sig": signature,
  };
  return { value: base64Url(deflateSync(Buffer.from(JSON.stringify(document)))), issuedAt };
}

function privateMapKey({ sdkAppId, secretKey, userId, roomId, expiresIn, canPublish }) {
  const account = Buffer.from(userId, "utf8");
  const room = Buffer.from(roomId, "utf8");
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  const userBuf = Buffer.alloc(1 + 2 + account.length + 20 + 2 + room.length);
  let offset = 0;
  userBuf.writeUInt8(1, offset); offset += 1;
  userBuf.writeUInt16BE(account.length, offset); offset += 2;
  account.copy(userBuf, offset); offset += account.length;
  userBuf.writeUInt32BE(sdkAppId, offset); offset += 4;
  userBuf.writeUInt32BE(0, offset); offset += 4;
  userBuf.writeUInt32BE(expiresAt, offset); offset += 4;
  // Create + enter + send audio + receive audio for speakers; enter + receive for listeners.
  userBuf.writeUInt32BE(canPublish ? 15 : 10, offset); offset += 4;
  userBuf.writeUInt32BE(0, offset); offset += 4;
  userBuf.writeUInt16BE(room.length, offset); offset += 2;
  room.copy(userBuf, offset);
  return userSig({ sdkAppId, secretKey, userId, expiresIn, userBuf }).value;
}

export function issueTrtcAccess(user, roomId, canPublish) {
  const { sdkAppId, secretKey } = trtcConfiguration();
  const userId = String(user.publicId ?? "").trim();
  const strRoomId = String(roomId ?? "").trim();
  if (!TRTC_ID_PATTERN.test(userId) || !strRoomId) {
    throw new Error("TRTC_INVALID_IDENTITY");
  }
  const access = userSig({ sdkAppId, secretKey, userId, expiresIn: USER_SIG_TTL_SECONDS });
  return {
    sdkAppId,
    userId,
    userSig: access.value,
    privateMapKey: privateMapKey({
      sdkAppId,
      secretKey,
      userId,
      roomId: strRoomId,
      expiresIn: USER_SIG_TTL_SECONDS,
      canPublish: Boolean(canPublish),
    }),
    strRoomId,
    role: canPublish ? "anchor" : "audience",
    appScene: "VOICE_CHATROOM",
    canPublish: Boolean(canPublish),
    expiresAt: new Date((access.issuedAt + USER_SIG_TTL_SECONDS) * 1000).toISOString(),
  };
}
