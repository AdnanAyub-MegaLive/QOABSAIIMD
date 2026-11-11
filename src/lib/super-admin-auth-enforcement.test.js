import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: null, allowed: false,
  admin: { id: "admin", role: "SUPER_ADMIN", active: true, sessionVersion: 1, passwordHash: "hash" },
  eventUser: { id: "events", role: "SUPER_ADMIN", active: true, tokenVersion: 1 },
  create: vi.fn(), update: vi.fn(), adminUpdate: vi.fn(),
}));
vi.mock("next-auth", () => ({ default: config => { mocks.config = config; return {}; } }));
vi.mock("next-auth/providers/credentials", () => ({ default: config => config }));
vi.mock("bcrypt", () => ({ default: { compare: async () => true } }));
vi.mock("./super-admin-device-request.js", () => ({ canAccessFromDevice: async role => role !== "SUPER_ADMIN" || mocks.allowed }));
vi.mock("./portal-staff-state.js", () => ({ effectiveAdmin: async () => mocks.admin, staffDto: x => x }));
vi.mock("./portal-idle-session.js", () => ({ PORTAL_IDLE_SECONDS: 3600, updatePortalActivity: x => x }));
vi.mock("./rate-limit.js", () => ({ isRateLimited: () => false }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "token" }) }) }));
vi.mock("jsonwebtoken", () => ({ default: {
  sign: () => "signed",
  verify: () => ({ sub: "events", tokenVersion: 1, scope: "events-management" }),
} }));
vi.mock("./events/config.js", () => ({ getEventConfig: () => ({ refreshDays: 1, accessMinutes: 15, jwtSecret: "test" }) }));
vi.mock("./prisma.js", () => {
  const db = {
    admin: { findUnique: async () => mocks.admin, update: mocks.adminUpdate },
    eventUser: { findUnique: async () => mocks.eventUser },
    eventRefreshToken: {
      create: mocks.create, update: mocks.update,
      findUnique: async () => ({ id: "refresh", user: mocks.eventUser, expiresAt: new Date(Date.now() + 60000) }),
    },
  };
  return { prisma: { ...db, $transaction: callback => callback(db) } };
});
import "../../auth.js";
import { createEventSession, rotateEventSession, requireEventUser } from "./events/auth.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = false;
  mocks.admin.role = mocks.eventUser.role = "SUPER_ADMIN";
});
describe("both portal authentication boundaries", () => {
  it("denies Super Admin password login before recording a login", async () => {
    expect(await mocks.config.providers[0].authorize({ email: "admin@test.com", password: "password" }, {})).toBeNull();
    expect(mocks.adminUpdate).not.toHaveBeenCalled();
  });
  it("denies an existing Super Admin main session", async () => {
    expect(await mocks.config.callbacks.jwt({ token: { sub: "admin", staffVersion: 1 } })).toBeNull();
  });
  it("allows approved main sessions and normal staff", async () => {
    mocks.allowed = true;
    expect(await mocks.config.callbacks.jwt({ token: { sub: "admin", staffVersion: 1 } })).toBeTruthy();
    mocks.allowed = false;
    mocks.admin.role = "ADMIN";
    expect(await mocks.config.providers[0].authorize({ email: "staff@test.com", password: "password" }, {})).toBeTruthy();
    expect(await mocks.config.callbacks.jwt({ token: { sub: "admin", staffVersion: 1 } })).toBeTruthy();
  });
  it("denies Events login, refresh and existing access without an approved device", async () => {
    await expect(createEventSession(mocks.eventUser, {})).rejects.toThrow("approved device");
    await expect(rotateEventSession("refresh", {})).rejects.toThrow("approved device");
    await expect(requireEventUser({})).rejects.toThrow("approved device");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([true, false])("allows Events with approved device=%s or ordinary staff", async approved => {
    mocks.allowed = approved;
    if (!approved) mocks.eventUser.role = "ADMIN";
    expect(await createEventSession(mocks.eventUser, {})).toHaveProperty("accessToken");
    expect(await rotateEventSession("refresh", {})).toHaveProperty("accessToken");
    expect(await requireEventUser({})).toBe(mocks.eventUser);
  });
});
