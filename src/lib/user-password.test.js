import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./password.js", () => ({ hashPassword: async p => `hash:${p}`, verifyPassword: async (p, h) => `hash:${p}` === h }));
vi.mock("./password-login-policy.js", () => ({ consumeAuthAttempts: vi.fn() }));
import { consumeAuthAttempts } from "./password-login-policy.js";
import { setUserPassword } from "./user-password.js";
import { connectionStatus } from "./account-connection-policy.js";
let db, user;
const identity = { id: "u", publicId: "USR-1", sessionVersion: 3 };
beforeEach(() => {
  vi.clearAllMocks();
  user = { ...identity, status: "ACTIVE", phone: null, passwordHash: null };
  db = { $queryRaw: vi.fn(), user: { findUnique: vi.fn(async () => ({ ...user })), update: vi.fn(async ({ data }) => Object.assign(user, data)) }, ban: { findFirst: vi.fn(async () => null) }, auditLog: { create: vi.fn() } };
  let queue = Promise.resolve();
  db.$transaction = fn => { const result = queue.then(() => fn(db)); queue = result.catch(() => {}); return result; };
});
it("sets the first password without phone/current password and audits PASSWORD_SET", async () => {
  const result = await setUserPassword(db, identity, { newPassword: "NewPassword1" });
  expect(result).toMatchObject({ hasPassword: true, passwordSet: true, passwordChanged: true });
  expect(consumeAuthAttempts).toHaveBeenCalledWith(db, ["password:update:u"], 5, 3600);
  expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "PASSWORD_SET", metadata: expect.objectContaining({ sessionPreserved: true }) }) });
  expect(user.sessionVersion).toBe(3);
  expect(connectionStatus(user)).toMatchObject({ hasPassword: true, phoneConnected: false });
});
it("requires and verifies the current password once one exists", async () => {
  user.passwordHash = "hash:OldPassword1";
  await expect(setUserPassword(db, identity, { newPassword: "NewPassword1" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  await expect(setUserPassword(db, identity, { currentPassword: "wrong", newPassword: "NewPassword1" })).rejects.toMatchObject({ code: "CURRENT_PASSWORD_INCORRECT", status: 401 });
  await expect(setUserPassword(db, identity, { currentPassword: "OldPassword1", newPassword: "OldPassword1" })).rejects.toMatchObject({ code: "PASSWORD_UNCHANGED" });
  expect(db.user.update).not.toHaveBeenCalled();
  expect(await setUserPassword(db, identity, { currentPassword: "OldPassword1", newPassword: "NewPassword1" })).toMatchObject({ passwordSet: false });
  expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "USER_PASSWORD_CHANGED" }) });
});
it.each(["short", "x".repeat(129)])("rejects invalid new password lengths", async newPassword => {
  await expect(setUserPassword(db, identity, { newPassword })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  expect(db.user.update).not.toHaveBeenCalled();
});
it("rechecks password state under the account row lock", async () => {
  const results = await Promise.allSettled([setUserPassword(db, identity, { newPassword: "PasswordA" }), setUserPassword(db, identity, { newPassword: "PasswordB" })]);
  expect(results.map(r => r.status)).toEqual(["fulfilled", "rejected"]);
  expect(user.passwordHash).toBe("hash:PasswordA");
  expect(db.$queryRaw.mock.calls[0][0].join("")).toContain("FOR UPDATE");
});
it("rejects revoked sessions and propagates persistent throttling", async () => {
  user.sessionVersion = 4;
  await expect(setUserPassword(db, identity, { newPassword: "Password1" })).rejects.toMatchObject({ code: "SESSION_REVOKED" });
  consumeAuthAttempts.mockRejectedValueOnce({ status: 429, code: "RATE_LIMITED" });
  await expect(setUserPassword(db, identity, { newPassword: "Password1" })).rejects.toMatchObject({ status: 429 });
  expect(db.user.update).not.toHaveBeenCalled();
});
