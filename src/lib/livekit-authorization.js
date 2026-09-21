import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const DEFAULT_TTL_SECONDS = 10 * 60;
const MIN_TTL_SECONDS = 5 * 60;
const MAX_TTL_SECONDS = 60 * 60;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function liveKitConfiguration() {
  const configuredUrl = String(process.env.LIVEKIT_URL ?? "").trim().replace(/\/$/, "");
  const url = configuredUrl.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
  const apiKey = String(process.env.LIVEKIT_API_KEY ?? "").trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET ?? "").trim();
  const secureUrl = /^wss:\/\//i.test(url);
  const localDevelopmentUrl = process.env.NODE_ENV !== "production" && /^ws:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url);
  if ((!secureUrl && !localDevelopmentUrl) || !apiKey || !apiSecret) {
    throw new Error("LIVEKIT_NOT_CONFIGURED");
  }
  const configuredTtl = Number(process.env.LIVEKIT_TOKEN_TTL_SECONDS);
  const ttlSeconds = Number.isInteger(configuredTtl)
    ? Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, configuredTtl))
    : DEFAULT_TTL_SECONDS;
  return { url, apiKey, apiSecret, ttlSeconds };
}

function serviceUrl(publicUrl) {
  return publicUrl.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
}

export function isLiveKitConfigured() {
  try {
    liveKitConfiguration();
    return true;
  } catch {
    return false;
  }
}

export async function issueLiveKitAccess(user, roomId, canPublish) {
  const { url, apiKey, apiSecret, ttlSeconds } = liveKitConfiguration();
  const userId = String(user?.publicId ?? "").trim();
  const room = String(roomId ?? "").trim();
  if (!ID_PATTERN.test(userId) || !ID_PATTERN.test(room)) {
    throw new Error("LIVEKIT_INVALID_IDENTITY");
  }

  const accessToken = new AccessToken(apiKey, apiSecret, {
    identity: userId,
    name: String(user?.name ?? userId).slice(0, 100),
    ttl: ttlSeconds,
    metadata: JSON.stringify({ portalUserId: userId }),
  });
  accessToken.addGrant({
    roomJoin: true,
    room,
    canSubscribe: true,
    canPublish: Boolean(canPublish),
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  const issuedAt = Math.floor(Date.now() / 1000);
  return {
    url,
    token: await accessToken.toJwt(),
    roomName: room,
    userId,
    canPublish: Boolean(canPublish),
    expiresAt: new Date((issuedAt + ttlSeconds) * 1000).toISOString(),
  };
}

export async function updateLiveKitPublishPermission(roomId, userId, canPublish) {
  if (!isLiveKitConfigured()) return { configured: false, updated: false };
  const { url, apiKey, apiSecret } = liveKitConfiguration();
  const client = new RoomServiceClient(serviceUrl(url), apiKey, apiSecret);
  try {
    await client.updateParticipant(String(roomId), String(userId), {
      permission: {
        canSubscribe: true,
        canPublish: Boolean(canPublish),
        canPublishData: false,
        canUpdateMetadata: false,
      },
    });
    return { configured: true, updated: true };
  } catch (error) {
    if ([404, 5].includes(error?.status ?? error?.code)) {
      return { configured: true, updated: false };
    }
    throw error;
  }
}
