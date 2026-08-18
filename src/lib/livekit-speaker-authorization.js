import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

function liveKitConfiguration() {
  const url = String(process.env.LIVEKIT_URL ?? "").trim();
  const apiKey = String(process.env.LIVEKIT_API_KEY ?? "").trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET ?? "").trim();
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }
  if (!parsed || !["ws:", "wss:"].includes(parsed.protocol) || !apiKey || !apiSecret)
    throw new Error("LIVEKIT_NOT_CONFIGURED");
  const httpUrl = new URL(parsed);
  httpUrl.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
  return { url, httpUrl: httpUrl.toString(), apiKey, apiSecret };
}

export async function issueLiveKitAccess(user, roomId, canPublish) {
  const config = liveKitConfiguration();
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: user.publicId,
    name: user.name,
    ttl: "10m",
  });
  token.addGrant({
    room: roomId,
    roomJoin: true,
    canPublish: Boolean(canPublish),
    canSubscribe: true,
    canPublishData: true,
  });
  return { token: await token.toJwt(), url: config.url, canPublish: Boolean(canPublish) };
}

export async function setLiveKitPublishPermission(roomId, speakerId, canPublish) {
  let config;
  try {
    config = liveKitConfiguration();
  } catch {
    return false;
  }
  try {
    const client = new RoomServiceClient(config.httpUrl, config.apiKey, config.apiSecret);
    await client.updateParticipant(roomId, speakerId, {
      permission: {
        canPublish: Boolean(canPublish),
        canSubscribe: true,
        canPublishData: true,
      },
    });
    return true;
  } catch (error) {
    console.warn(`LiveKit permission update skipped for ${speakerId} in ${roomId}:`, error?.message ?? error);
    return false;
  }
}
