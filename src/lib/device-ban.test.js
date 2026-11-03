import { describe, it, expect, vi } from "vitest";
import { assertSessionDevice, changeDeviceBan, disconnectBannedDevice } from "./device-ban.js";

describe("device bans", () => {
  it("rejects a session when another account has the same banned identifier", async () => {
    const db = { device: { findUnique: vi.fn(async () => ({ id: "own" })), findFirst: vi.fn(async () => ({ id: "other" })) } };
    await expect(assertSessionDevice(db, "user", "phone")).rejects.toThrow("DEVICE_BANNED");
    expect(db.device.findFirst).toHaveBeenCalledWith({ where: { macAddress: "phone", isBanned: true }, select: { id: true } });
    db.device.findFirst.mockResolvedValue(null);
    await expect(assertSessionDevice(db, "user", "phone")).resolves.toBeUndefined();
    db.device.findUnique.mockResolvedValue(null);
    await expect(assertSessionDevice(db, "user", "phone")).rejects.toThrow("DEVICE_NOT_REGISTERED");
  });

  function database(failAudit = false) {
    const state = { banned: false, bans: [] };
    const tx = {
      $queryRaw: vi.fn(async () => []),
      user: { findUnique: vi.fn(async () => ({ id: "host-user" })),
        findMany: vi.fn(async () => [{ id: "host-user", publicId: "TLN-123" }, { id: "past-user", publicId: "USR-2" }]),
        updateMany: vi.fn(async () => {}),
      },
      talent: { findUnique: vi.fn(), updateMany: vi.fn(async () => {}) },
      device: {
        findFirst: vi.fn(async () => ({ id: "one" })),
        findMany: vi.fn(async () => [{ id: "one", userId: "host-user" }, { id: "two", userId: "past-user", talentId: "legacy-host" }]),
        updateMany: vi.fn(async ({ data }) => { state.banned = data.isBanned; }),
      },
      ban: {
        createMany: vi.fn(async ({ data }) => { state.bans.push(...data); }),
        updateMany: vi.fn(async () => { state.bans.filter(b => b.target === "DEVICE").forEach(b => { b.revokedAt = new Date(); }); }),
      },
      auditLog: { create: vi.fn(async () => { if (failAudit) throw new Error("audit failed"); }) },
    };
    return { state, tx, $transaction: async fn => {
      const before = structuredClone(state);
      try { return await fn(tx); } catch (error) { Object.assign(state, before); throw error; }
    } };
  }
  const input = { publicId: "TLN-123", macAddress: "phone", reason: "test", durationMinutes: 60, permanent: false };
  const admin = { id: "admin", name: "Admin" };
  it("bans every matching device atomically and resolves TLN user accounts correctly", async () => {
    const db = database();
    const result = await changeDeviceBan(db, admin, input, true);
    expect(db.state.banned).toBe(true);
    expect(db.state.bans.filter(b => b.target === "DEVICE").map(b => b.deviceId)).toEqual(["one", "two"]);
    expect(db.state.bans.filter(b => b.target === "USER")).toHaveLength(3);
    expect(result.bannedAccountIds).toEqual(["TLN-123", "USR-2"]);
    expect(db.tx.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ id: { in: ["host-user", "past-user"] } }, { signupDeviceId: "phone" }] } }));
    expect(db.tx.user.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["host-user", "past-user"] } }, data: { status: "BANNED", sessionVersion: { increment: 1 }, forcedLogoutAt: expect.any(Date) } });
    expect(db.tx.talent.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["legacy-host"] } }, data: { status: "BANNED" } });
    expect(db.tx.talent.findUnique).not.toHaveBeenCalled();
    expect(db.tx.device.findFirst).toHaveBeenCalledWith({ where: { macAddress: "phone", userId: "host-user" } });
    expect(result.banExpiresAt).toBeTruthy();
    await changeDeviceBan(db, admin, input, false);
    expect(db.state.banned).toBe(false);
    expect(db.state.bans.filter(b => b.target === "DEVICE").every(b => b.revokedAt)).toBe(true);
    expect(db.state.bans.filter(b => b.target === "USER").every(b => !b.revokedAt)).toBe(true);
    expect(db.tx.user.updateMany).toHaveBeenCalledTimes(1);
  });
  it("rolls back the ban flags and records if the transaction fails", async () => {
    const db = database(true);
    await expect(changeDeviceBan(db, admin, input, true)).rejects.toThrow("audit failed");
    expect(db.state).toEqual({ banned: false, bans: [] });
  });
  it("rejects invalid duration and unrelated account/device selection without writes", async () => {
    const db = database();
    await expect(changeDeviceBan(db, admin, { ...input, durationMinutes: 0 }, true)).rejects.toMatchObject({ status: 422 });
    db.tx.device.findFirst.mockResolvedValue(null);
    await expect(changeDeviceBan(db, admin, input, true)).rejects.toMatchObject({ status: 404 });
    expect(db.tx.ban.createMany).not.toHaveBeenCalled();
  });
  it("disconnects only sockets on the banned device, including other accounts", async () => {
    const sockets = ["phone", "other", "phone"].map(deviceId => ({ data: { deviceId }, emit: vi.fn(), disconnect: vi.fn() }));
    await disconnectBannedDevice({ fetchSockets: async () => sockets }, "phone", { macAddress: "phone" });
    expect(sockets[0].disconnect).toHaveBeenCalledWith(true);
    expect(sockets[2].disconnect).toHaveBeenCalledWith(true);
    expect(sockets[1].disconnect).not.toHaveBeenCalled();
    expect(sockets[0].emit).toHaveBeenCalledWith("device:banned", { success: true, data: { macAddress: "phone" } });
  });
  it("disconnects linked accounts on other devices without exposing account lists", async () => {
    const sockets = ["USR-2", "unrelated"].map(userId => ({ data: { userId, deviceId: "other-phone" }, emit: vi.fn(), disconnect: vi.fn() }));
    await disconnectBannedDevice({ fetchSockets: async () => sockets }, "phone", { macAddress: "phone", bannedAccountIds: ["USR-2"], reason: "test", banExpiresAt: null });
    expect(sockets[0].disconnect).toHaveBeenCalledWith(true);
    expect(sockets[1].disconnect).not.toHaveBeenCalled();
    expect(sockets[0].emit).toHaveBeenCalledWith("account:banned", { success: true, data: { isBanned: true, banReason: "Device ban: test", banExpiresAt: null } });
  });
});
