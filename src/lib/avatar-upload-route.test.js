import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), limited: vi.fn(), read: vi.fn(), decode: vi.fn(), save: vi.fn(), log: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { apiRequestLog: { create: mocks.log } } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/mobile-v1", async () => await import("./mobile-v1.js"));
vi.mock("@/lib/mobile-api", () => ({
  requireMobileUser: mocks.auth, mobileJson: (body, status = 200) => Response.json(body, { status }),
  mobileApiError: (error, fallback) => Response.json({ success: false, error: { code: error.message === "INVALID_SESSION" ? error.message : fallback } }, { status: error.message === "INVALID_SESSION" ? 401 : 500 }),
}));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: mocks.limited }));
vi.mock("@/lib/user-perks", () => ({ requestOrigin: () => "https://portal.test" }));
vi.mock("@/lib/avatar-upload", () => ({ readAvatarFile: mocks.read, decodeAvatar: mocks.decode, saveAvatar: mocks.save }));
import { POST } from "../app/api/v1/users/me/avatar/route.js";
const request = () => new Request("https://portal.test/api/v1/users/me/avatar", { method: "POST" });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ id: "authenticated-user" });
  mocks.limited.mockReturnValue(false);
  mocks.read.mockResolvedValue("file"); mocks.decode.mockResolvedValue("bytes");
  mocks.save.mockResolvedValue("https://portal.test/signed-avatar");
});
it("authenticates before reading upload and preserves v1 error headers", async () => {
  mocks.auth.mockRejectedValue(new Error("INVALID_SESSION"));
  const response = await POST(request());
  expect(response.status).toBe(401);
  expect(response.headers.get("X-API-Version")).toBe("v1");
  expect(response.headers.get("X-Request-Id")).toBeTruthy();
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});
it("limits by authenticated user before parsing and includes Retry-After", async () => {
  mocks.limited.mockReturnValue(true);
  const response = await POST(request());
  expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("60");
  expect(mocks.limited).toHaveBeenCalledWith("avatar-upload:authenticated-user", { limit: 10, windowMs: 60000 });
  expect(mocks.read).not.toHaveBeenCalled();
});
it("returns 201 with only the authenticated user's saved picture", async () => {
  const response = await POST(request());
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ success: true, data: { profileImage: "https://portal.test/signed-avatar" } });
  expect(mocks.save).toHaveBeenCalledWith({}, "authenticated-user", "bytes", "https://portal.test");
});
