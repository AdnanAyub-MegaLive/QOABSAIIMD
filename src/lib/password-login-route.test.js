import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ resolve: vi.fn(), consume: vi.fn(), verify: vi.fn(), ban: vi.fn(), device: vi.fn(), audit: vi.fn(), replace: vi.fn(), assertDevice: vi.fn() }));
vi.mock("./password-login-policy", async original => ({ ...await original(), resolvePasswordLoginUser: m.resolve, consumeAuthAttempts: m.consume }));
vi.mock("./password", () => ({ verifyPassword: m.verify }));
vi.mock("./prisma", () => {
  const tx = { device: { upsert: m.device }, user: { update: vi.fn() }, auditLog: { create: m.audit } };
  return { prisma: { ban: { findFirst: m.ban }, $transaction: fn => fn(tx) } };
});
vi.mock("./vip-capabilities", () => ({ userVip: async () => ({}) }));
vi.mock("./profile-edit-policy", () => ({ profileEditPermissions: () => ({}) }));
vi.mock("./user-roles", () => ({ managementIdentity: () => ({}) }));
vi.mock("./special-id", () => ({ reconcileExpiredSpecialIds: async () => {}, getEffectiveUserId: async () => ({ effectiveId: "2030146", normalId: "USR-2030146" }) }));
vi.mock("./ban-maintenance", () => ({ reconcileExpiredBans: async () => {} }));
vi.mock("./mobile-login-response", () => ({ bannedAccountLoginResponse: () => ({ success: false, error: { code: "ACCOUNT_BANNED" } }) }));
vi.mock("./user-perks", () => ({ requestOrigin: () => "https://portal.test", resolveUserPerks: async () => new Map() }));
vi.mock("./device-account-policy", () => ({ assertDeviceAccount: m.assertDevice, replaceMobileSession: m.replace, disconnectReplacedSessions: vi.fn() }));
vi.mock("./media-payload", () => ({ versionMediaPayload: async x => x }));
vi.mock("./mobile-session.cjs", () => ({ default: { createMobileSession: () => ({ token: "test-token" }) } }));
import { POST } from "../app/api/users/login/route.js";
let user;
const call = (input = {}) => POST(new Request("https://portal.test/api/users/login", {
  method: "POST", headers: { "Content-Type": "application/json", "x-real-ip": "192.0.2.1" },
  body: JSON.stringify({ identifier: "2030146", phone: "2030146", password: "Password1", device: { deviceId: "device-a", location: "Pakistan" }, ...input }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  user = { id: "user", publicId: "USR-2030146", passwordHash: "hash", sessionVersion: 1, createdAt: new Date(), phone: null };
  m.resolve.mockResolvedValue(user); m.verify.mockResolvedValue(true); m.replace.mockResolvedValue(user);
  m.device.mockResolvedValue({ macAddress: "device-a" }); m.ban.mockResolvedValue(null);
});
it.each(["missing", "passwordless", "wrong", "deleted"])("uses the same error for %s credentials", async situation => {
  if (situation === "missing") m.resolve.mockResolvedValue(null);
  if (situation === "passwordless") user.passwordHash = null;
  if (situation === "wrong") m.verify.mockResolvedValue(false);
  if (situation === "deleted") user.deletedAt = new Date();
  const response = await call(); expect(response.status).toBe(401);
  expect((await response.json()).error).toEqual({ code: "INVALID_CREDENTIALS", message: "ID or password is incorrect." });
  expect(m.replace).not.toHaveBeenCalled();
});
it("preserves successful device/session/audit behavior and reports password state", async () => {
  const response = await call(); expect(response.status).toBe(200);
  expect((await response.json()).data.user.hasPassword).toBe(true);
  expect(m.assertDevice).toHaveBeenCalledWith(expect.anything(), "device-a", "user");
  expect(m.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "USER_LOGIN" }) });
  expect(m.replace).toHaveBeenCalledWith(expect.anything(), "user", "device-a");
  expect(m.consume).toHaveBeenCalledWith(expect.anything(), ["login:identifier:2030146", "login:device:device-a", "login:ip:192.0.2.1"], 10, 900);
});
it("preserves bans without issuing a session", async () => {
  m.ban.mockResolvedValue({ reason: "banned" });
  expect((await call()).status).toBe(403);
  expect(m.replace).not.toHaveBeenCalled();
  expect(m.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "BANNED_USER_LOGIN_ATTEMPT" }) });
});
it("throttles before credential lookup with Retry-After", async () => {
  m.consume.mockRejectedValue({ status: 429, code: "RATE_LIMITED", message: "Try later", retryAfter: 900 });
  const response = await call(); expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("900"); expect(m.resolve).not.toHaveBeenCalled();
});
