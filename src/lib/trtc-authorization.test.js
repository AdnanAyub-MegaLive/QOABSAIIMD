import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inflateSync } from "node:zlib";
import { createHmac } from "node:crypto";
import { issueTrtcAccess } from "./trtc-authorization.js";
import { rtcFields, rtcProvider } from "./rtc-provider.js";
import { issueLiveKitAccess, isLiveKitConfigured } from "./livekit-authorization.js";

function decode(ticket) { return JSON.parse(inflateSync(Buffer.from(ticket.replace(/\*/g,"+").replace(/-/g,"/").replace(/_/g,"="), "base64")).toString()); }
beforeEach(() => {
  vi.stubEnv("RTC_PROVIDER", "TRTC"); vi.stubEnv("TRTC_SDK_APP_ID", "20044231");
  vi.stubEnv("TRTC_SECRET_KEY", "unit-test-secret"); vi.stubEnv("TRTC_ADVANCED_PERMISSION_ENABLED", "true");
  vi.stubEnv("TENCENT_CLOUD_SECRET_ID", "test"); vi.stubEnv("TENCENT_CLOUD_SECRET_KEY", "test");
  vi.stubEnv("TRTC_TOKEN_TTL_SECONDS", "300");
});
afterEach(() => vi.unstubAllEnvs());
describe("TRTC credentials and provider isolation", () => {
  it.each([[false,false,11],[true,false,15],[false,true,43],[true,true,63]])("binds role permissions to string room (%s %s)", (publish, video, bits) => {
    const access = issueTrtcAccess({publicId:"USR-123"}, "ROOM-123", publish, {video});
    const sig = decode(access.privateMapKey), buf = Buffer.from(sig["TLS.userbuf"], "base64");
    const length = buf.readUInt16BE(1);
    expect(buf[0]).toBe(1); expect(buf.readUInt32BE(3+length+12)).toBe(bits);
    expect(buf.subarray(3+length+22).toString()).toBe("ROOM-123");
    const input = `TLS.identifier:USR-123\nTLS.sdkappid:20044231\nTLS.time:${sig["TLS.time"]}\nTLS.expire:300\nTLS.userbuf:${sig["TLS.userbuf"]}\n`;
    expect(sig["TLS.sig"]).toBe(createHmac("sha256", "unit-test-secret").update(input).digest("base64"));
    expect(decode(access.userSig)["TLS.identifier"]).toBe("USR-123");
    expect(rtcFields(access)).toMatchObject({rtcProvider:"TRTC",liveKit:null,trtc:{canPublish:publish}});
    expect(JSON.stringify(access)).not.toContain("unit-test-secret");
  });
  it("fails closed until permission control is confirmed", () => {
    vi.stubEnv("TRTC_ADVANCED_PERMISSION_ENABLED", "false");
    expect(() => issueTrtcAccess({publicId:"USR-1"},"ROOM-1",false)).toThrow("TRTC_PERMISSION_SETUP_REQUIRED");
  });
  it("requires cloud moderation credentials", () => {
    vi.stubEnv("TENCENT_CLOUD_SECRET_ID", "");
    expect(() => issueTrtcAccess({publicId:"USR-1"},"ROOM-1",false)).toThrow("TRTC_CLOUD_NOT_CONFIGURED");
  });
  it("does not issue LiveKit tokens while TRTC is selected", async () => {
    expect(isLiveKitConfigured()).toBe(false);
    await expect(issueLiveKitAccess({publicId:"USR-1"},"ROOM-1",true)).rejects.toThrow("RTC_PROVIDER_DISABLED");
  });
  it("rejects invalid provider and identities", () => {
    expect(() => issueTrtcAccess({publicId:"../user"},"ROOM-1",false)).toThrow("RTC_INVALID_IDENTITY");
    vi.stubEnv("RTC_PROVIDER", "UNKNOWN"); expect(rtcProvider).toThrow("RTC_PROVIDER_INVALID");
  });
});
