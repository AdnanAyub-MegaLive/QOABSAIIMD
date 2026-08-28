import { describe, expect, it, vi } from "vitest";
import { inflateSync } from "node:zlib";
import { issueTrtcAccess } from "./trtc-authorization";

function decodeUserSig(value) {
  const base64 = value.replace(/_/g, "=").replace(/-/g, "/").replace(/\*/g, "+");
  return JSON.parse(inflateSync(Buffer.from(base64, "base64")).toString("utf8"));
}

describe("TRTC authorization", () => {
  it("issues a room-scoped speaker credential without exposing the secret", () => {
    vi.stubEnv("TRTC_SDK_APP_ID", "1400000000");
    vi.stubEnv("TRTC_SECRET_KEY", "test-secret");

    const access = issueTrtcAccess({ publicId: "USR-1048" }, "ROOM-123456", true);

    expect(access).toMatchObject({
      sdkAppId: 1400000000,
      userId: "USR-1048",
      strRoomId: "ROOM-123456",
      role: "anchor",
      appScene: "VOICE_CHATROOM",
      canPublish: true,
    });
    expect(access.userSig).not.toContain("test-secret");
    expect(access.privateMapKey).not.toContain("test-secret");
    expect(decodeUserSig(access.userSig)["TLS.identifier"]).toBe("USR-1048");
  });
});
