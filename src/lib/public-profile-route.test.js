import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ access: vi.fn(), extras: vi.fn(), auth: vi.fn() }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/prisma", () => ({ prisma: Object.fromEntries(["friendRequest", "userFollow", "userProfileLike", "userProfileVisit", "userAlbumItem"].map(k => [k, { count: async () => 0, findUnique: async () => null, findMany: async () => [] }])) }));
vi.mock("@/lib/mobile-api", () => ({
  requireMobileUser: m.auth, mobileCorsHeaders: {}, mobileOptions: () => new Response(null),
  mobileJson: async body => Response.json(body),
  mobileApiError: async e => Response.json({ success: false, error: { code: e.message === "INVALID_SESSION" ? "INVALID_SESSION" : "PUBLIC_PROFILE_FAILED" } }, { status: e.message === "INVALID_SESSION" ? 401 : 500 }),
}));
vi.mock("@/lib/public-profile", () => ({ profileAccess: m.access, profileExtras: m.extras, recordProfileVisit: vi.fn(), publicAge: () => null, wallCursor: () => null }));
vi.mock("@/lib/user-perks", () => ({ requestOrigin: () => "https://portal.test", resolveUserPerks: async () => new Map() }));
vi.mock("@/lib/role-tags", () => ({ resolveRoleTags: async () => new Map() }));
vi.mock("@/lib/joinable-presence", () => ({ joinableAudioPresence: async () => null }));
vi.mock("@/lib/media-payload", () => ({ versionMediaPayload: async body => body }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: () => false }));
import { GET } from "../app/api/v1/users/[publicId]/profile/route.js";
const get = () => GET(new Request("https://portal.test/api/v1/users/USR-1/profile"), { params: Promise.resolve({ publicId: "USR-1" }) });
beforeEach(() => {
  m.auth.mockResolvedValue({ id: "viewer" });
  m.access.mockResolvedValue({ target: { id: "target", publicId: "USR-1", name: "Test", audioRooms: [], vipLevel: 4 }, isSelf: false });
  m.extras.mockResolvedValue({ userLevel: 9, agency: { publicId: "AGN-1" }, progression: { user: { lifetimePoints: "123" }, charm: { lifetimePoints: "456" } } });
});
afterEach(() => vi.restoreAllMocks());
it("awaits asynchronous serialization before setting private headers", async () => {
  const response = await get();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect((await response.json()).data.user).toMatchObject({ vipLevel: 4, userLevel: 9, agency: { publicId: "AGN-1" } });
});
it("logs the failure stage without replacing core data with defaults", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  m.extras.mockRejectedValue(new Error("secret query arguments"));
  const response = await get();
  expect(response.status).toBe(500);
  expect((await response.json()).error.code).toBe("PUBLIC_PROFILE_FAILED");
  expect(log).toHaveBeenCalledWith("Public profile failed", expect.objectContaining({ stage: "profile-data" }));
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret query arguments");
});
it("keeps invalid sessions as 401 without logging them as server failures", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  m.auth.mockRejectedValue(new Error("INVALID_SESSION"));
  expect((await get()).status).toBe(401);
  expect(log).not.toHaveBeenCalled();
});
