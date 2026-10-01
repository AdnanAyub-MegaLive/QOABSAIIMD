import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), user: vi.fn(), profile: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { user: { findUnique: mocks.user }, ban: { findFirst: async () => null }, device: { findUnique: async () => null } } }));
vi.mock("./mobile-session.cjs", () => ({ default: { verifyMobileSessionToken: mocks.verify } }));
vi.mock("./special-id", () => ({ reconcileExpiredSpecialIds: async () => {}, getEffectiveUserId: async () => ({ effectiveId: "USR-1" }) }));
vi.mock("./ban-maintenance", () => ({ reconcileExpiredBans: async () => {} }));
vi.mock("./mobile-user-profile", () => ({ mobileUserProfile: mocks.profile }));
import { GET } from "../app/api/users/session/status/route";
const request = () => new Request("http://localhost/api/users/session/status?deviceId=phone", { headers: { authorization: "Bearer test" } });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.verify.mockReturnValue({ userId: "USR-1", deviceId: "phone", sessionVersion: 0 });
  mocks.user.mockResolvedValue({ id: "u", status: "ACTIVE", sessionVersion: 0 });
  mocks.profile.mockResolvedValue({});
});
it.each(["INVALID_SESSION_TOKEN", "EXPIRED_SESSION_TOKEN"])("returns 401 for %s", async message => {
  mocks.verify.mockImplementation(() => { throw new Error(message); });
  expect((await GET(request())).status).toBe(401);
});
it("returns 401 for revoked sessions", async () => {
  mocks.user.mockResolvedValue({ id: "u", status: "ACTIVE", sessionVersion: 1 });
  const result = await GET(request());
  expect(result.status).toBe(401);
  expect((await result.json()).error.code).toBe("SESSION_REVOKED");
});
it.each(["database", "profile", "configuration"])("returns 500 for %s failures", async source => {
  if (source === "database") mocks.user.mockRejectedValue(new Error("Database unavailable"));
  if (source === "profile") mocks.profile.mockRejectedValue(new Error("Profile unavailable"));
  if (source === "configuration") mocks.verify.mockImplementation(() => { throw new Error("AUTH_SECRET missing"); });
  const result = await GET(request());
  expect(result.status).toBe(500);
  expect((await result.json()).error.code).toBe("SESSION_STATUS_FAILED");
});
