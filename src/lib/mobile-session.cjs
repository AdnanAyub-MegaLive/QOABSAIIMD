const { createHmac, timingSafeEqual } = require("node:crypto");

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30;

const secret = () => {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is required for mobile sessions.");
  return process.env.AUTH_SECRET;
};
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const signature = (body) => createHmac("sha256", secret()).update(body).digest("base64url");

function sessionTtlSeconds() {
  const configured = Number(process.env.MOBILE_SESSION_TTL_SECONDS);
  return Number.isInteger(configured) && configured >= 300 && configured <= 60 * 60 * 24 * 90
    ? configured
    : DEFAULT_TTL_SECONDS;
}

function normalizedDeviceId(deviceId) {
  return typeof deviceId === "string" && deviceId.trim()
    ? deviceId.trim().slice(0, 255)
    : undefined;
}

function issueMobileSessionToken(user, { deviceId, issuedAt, expiresAt }) {
  const body = encode({
    userId: user.publicId,
    sessionVersion: user.sessionVersion,
    deviceId: normalizedDeviceId(deviceId),
    issuedAt,
    exp: Math.floor(expiresAt.getTime() / 1000),
  });
  return `${body}.${signature(body)}`;
}

function createMobileSession(user, { deviceId } = {}) {
  // `exp` is stored in whole seconds, so align the returned ISO timestamp with
  // that exact boundary rather than advertising a later millisecond value.
  const issuedAt = Math.floor(Date.now() / 1000) * 1000;
  const expiresAt = new Date(issuedAt + sessionTtlSeconds() * 1000);

  return {
    sessionToken: issueMobileSessionToken(user, { deviceId, issuedAt, expiresAt }),
    tokenType: "Bearer",
    expiresAt: expiresAt.toISOString(),
    sessionVersion: user.sessionVersion,
  };
}

function createMobileSessionToken(user, options = {}) {
  return createMobileSession(user, options).sessionToken;
}

function verifyMobileSessionToken(token) {
  const [body,supplied]=String(token||"").split(".");
  if(!body||!supplied)throw new Error("INVALID_SESSION_TOKEN");
  const expected=signature(body);
  const a=Buffer.from(supplied); const b=Buffer.from(expected);
  if(a.length!==b.length||!timingSafeEqual(a,b))throw new Error("INVALID_SESSION_TOKEN");
  const payload=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));
  if(!payload.userId||!Number.isInteger(payload.sessionVersion)||payload.exp<=Math.floor(Date.now()/1000))throw new Error("EXPIRED_SESSION_TOKEN");
  return payload;
}

module.exports={createMobileSession,createMobileSessionToken,verifyMobileSessionToken,sessionTtlSeconds};
