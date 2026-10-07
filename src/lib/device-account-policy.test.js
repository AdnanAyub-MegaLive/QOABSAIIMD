import { describe, it, expect, vi } from "vitest";
import { assertDeviceAccount, replaceMobileSession } from "./device-account-policy.js";
import { sessionInvalidation } from "./mobile-session-state.js";

const database = (records = [], signupOwner = null) => {
  const user = { id: "u1", publicId: "USR-1", status: "ACTIVE", sessionVersion: 4 };
  const db = {
    $queryRaw: vi.fn(async () => []),
    device: { findMany: vi.fn(async () => records) },
    ban: { findFirst: vi.fn(async () => null) },
    user: {
      findUnique: vi.fn(async ({ where }) => where.signupDeviceId ? signupOwner : user),
      update: vi.fn(async () => ({ ...user, sessionVersion: ++user.sessionVersion })),
    },
    $transaction: fn => fn(db),
  };
  return db;
};
describe("single-account device policy", () => {
  it("allows a new device and its existing account", async () => {
    await assertDeviceAccount(database(), "device", "u1");
    await assertDeviceAccount(database([{ userId: "u1" }]), "device", "u1");
  });
  it("rejects another signup but allows existing accounts to log in on that device", async () => {
    const db = database([{ userId: "u1" }], { id: "u1" });
    await expect(assertDeviceAccount(db, "device")).rejects.toMatchObject({ code: "DEVICE_ACCOUNT_CONFLICT", status: 409 });
    await assertDeviceAccount(db, "device", "u2");
  });
  it("login history alone does not consume the signup allowance", async () => {
    await assertDeviceAccount(database([{ userId: "visitor" }]), "device");
  });
  it("rejects banned devices and missing identifiers", async () => {
    await expect(assertDeviceAccount(database([{ isBanned: true }]), "device", "u1")).rejects.toMatchObject({ code: "DEVICE_BANNED" });
    await expect(assertDeviceAccount(database(), "")).rejects.toMatchObject({ status: 422 });
  });
  it("revokes the old token version and only keeps the latest login valid", async () => {
    const db = database([{ userId: "u1" }]);
    const first = await replaceMobileSession(db, "u1", "device1");
    const second = await replaceMobileSession(db, "u1", "device2");
    expect(sessionInvalidation(second, { sessionVersion: first.sessionVersion })).toBe("SESSION_REVOKED");
    expect(sessionInvalidation(second, { sessionVersion: second.sessionVersion })).toBeNull();
  });
  it("does not revoke sessions on rejected login", async () => {
    const db = database([{ userId: "someone-else", isBanned: true }]);
    await expect(replaceMobileSession(db, "u1", "device")).rejects.toMatchObject({ code: "DEVICE_BANNED" });
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
