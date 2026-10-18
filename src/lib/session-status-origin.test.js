import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), verify: vi.fn(), assert: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { user: { findUnique: async () => ({ id: "test-user", publicId: "USR-test", sessionVersion: 1 }) }, ban: { findFirst: async () => null }, device: { findUnique: async () => null } } }));
vi.mock("./mobile-session.cjs", () => ({ default: { verifyMobileSessionToken: mocks.verify } }));
vi.mock("./mobile-session-state", () => ({ assertMobileSession: mocks.assert, mobileSessionError: () => ({ error: { code: "INVALID_SESSION" } }) }));
vi.mock("./special-id", () => ({ reconcileExpiredSpecialIds: async () => {}, getEffectiveUserId: async () => ({ effectiveId: "USR-test", normalId: "USR-test" }) }));
vi.mock("./ban-maintenance", () => ({ reconcileExpiredBans: async () => {} }));
vi.mock("./mobile-user-profile", () => ({ mobileUserProfile: mocks.profile }));
vi.mock("@/lib/user-perks", () => ({ requestOrigin: () => "https://portal.megachat.live" }));
vi.mock("@/lib/media-payload", () => ({ versionMediaPayload: async value => value }));
import { GET } from "../app/api/users/session/status/route.js";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockReturnValue({ userId: "USR-test", deviceId: "device-test" });
  mocks.assert.mockImplementation(() => {});
  mocks.profile.mockImplementation(async (id, origin) => ({ userLevelBackgroundUrl: new URL("/api/uploads/AST-test/file", origin).href }));
});
const request = device => new Request(`https://portal.megachat.live/api/users/session/status?deviceId=${device}`, { headers: { authorization: "Bearer test-only" } });
it("passes the public origin to profile artwork generation", async () => {
  const response = await GET(request("device-test"));
  expect(response.status).toBe(200);
  expect(mocks.profile).toHaveBeenCalledWith("test-user", "https://portal.megachat.live");
  expect((await response.json()).data.user.userLevelBackgroundUrl).toBe("https://portal.megachat.live/api/uploads/AST-test/file");
});
it("still rejects another device before building profile media", async () => {
  expect((await GET(request("other-device"))).status).toBe(401);
  expect(mocks.profile).not.toHaveBeenCalled();
});
it("still rejects revoked sessions before building profile media", async () => {
  mocks.assert.mockImplementation(() => { throw new Error("SESSION_REVOKED"); });
  expect((await GET(request("device-test"))).status).toBe(401);
  expect(mocks.profile).not.toHaveBeenCalled();
});
