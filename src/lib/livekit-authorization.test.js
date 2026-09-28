import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenVerifier } from "livekit-server-sdk";
import { isLiveKitConfigured, issueLiveKitAccess } from "./livekit-authorization";

const apiKey = "test-api-key";
const apiSecret = "test-api-secret-with-enough-entropy";

afterEach(() => vi.unstubAllEnvs());

function configure() {
  vi.stubEnv("LIVEKIT_URL", "wss://mega-live.example");
  vi.stubEnv("LIVEKIT_API_KEY", apiKey);
  vi.stubEnv("LIVEKIT_API_SECRET", apiSecret);
  vi.stubEnv("LIVEKIT_TOKEN_TTL_SECONDS", "600");
}

describe("LiveKit authorization", () => {
  it("allows a private-LAN ws endpoint during local development", () => {
    configure();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LIVEKIT_URL", "ws://192.168.88.167:7880");
    expect(isLiveKitConfigured()).toBe(true);
  });

  it("rejects insecure ws endpoints in production", () => {
    configure();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LIVEKIT_URL", "ws://192.168.88.167:7880");
    expect(isLiveKitConfigured()).toBe(false);
  });
  it("issues a room-bound subscribe-only token for a listener", async () => {
    configure();
    const access = await issueLiveKitAccess(
      { publicId: "USR-100", name: "Listener" },
      "ROOM-100",
      false,
    );
    const claims = await new TokenVerifier(apiKey, apiSecret).verify(access.token);
    expect(access).toMatchObject({
      url: "wss://mega-live.example",
      roomName: "ROOM-100",
      userId: "USR-100",
      canPublish: false,
    });
    expect(claims.video).toMatchObject({
      room: "ROOM-100",
      roomJoin: true,
      canSubscribe: true,
      canPublish: false,
    });
    expect(JSON.stringify(access)).not.toContain(apiSecret);
  });

  it("issues publish access only when the server authorizes it", async () => {
    configure();
    const access = await issueLiveKitAccess(
      { publicId: "TLN-200", name: "Speaker" },
      "ROOM-100",
      true,
    );
    const claims = await new TokenVerifier(apiKey, apiSecret).verify(access.token);
    expect(access.canPublish).toBe(true);
    expect(claims.video?.canPublish).toBe(true);
  });
});
