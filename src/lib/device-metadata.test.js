import { beforeEach, describe, expect, it, vi } from "vitest";
import { deviceMetadataInput, syncDeviceMetadata } from "./device-metadata";

const payload = { userId: "USR-1", sessionVersion: 0, deviceId: "phone" };
let db, record, user, ban;
beforeEach(() => {
  record = { id: "device", macAddress: "phone", platform: "Android", deviceName: "Old", location: "Old city", lastLoginIp: "1.1.1.1", lastLoginAt: new Date(0), isBanned: false };
  user = { id: "internal", publicId: "USR-1", status: "ACTIVE", sessionVersion: 0 };
  ban = null;
  db = {
    $queryRaw: vi.fn(async () => []),
    user: { findUnique: vi.fn(async () => user) },
    ban: { findFirst: vi.fn(async ({ where }) => ban?.target === where.target ? ban : null) },
    device: {
      findMany: vi.fn(async () => record ? [{ ...record, userId: user.id }] : []),
      findUnique: vi.fn(async () => record),
      update: vi.fn(async ({ data }) => (record = { ...record, ...data })),
      create: vi.fn(async ({ data }) => (record = { id: "new", ...data })),
    },
    auditLog: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async fn => fn(db)),
  };
});
const input = body => deviceMetadataInput({ deviceId: "phone", ...body }, new Headers({ "x-forwarded-for": " 2.2.2.2, 3.3.3.3" }));
describe("device metadata sync", () => {
  it("changes metadata once while refreshing the existing timestamp on every sync", async () => {
    const data = input({ deviceName: " New ", userId: "attacker", lastLoginIp: "fake", isBanned: false });
    expect(await syncDeviceMetadata(db, payload, data)).toEqual({ updated: true, seenAt: expect.any(String) });
    expect(await syncDeviceMetadata(db, payload, data)).toEqual({ updated: false, seenAt: expect.any(String) });
    expect(record.lastLoginAt.getTime()).toBeGreaterThan(0);
    expect(record.lastLoginIp).toBe("2.2.2.2");
    expect(record.location).toBe("Old city");
    expect(db.device.update).toHaveBeenCalledTimes(2);
    expect(record).not.toHaveProperty("lastActiveAt");
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    expect(db.device.update.mock.calls[0][0].data).toEqual({ deviceName: "New", lastLoginIp: "2.2.2.2", lastLoginAt: expect.any(Date) });
    expect(db.device.update.mock.calls[1][0].data).toEqual({ lastLoginAt: expect.any(Date) });
    expect(db.device.update.mock.calls[0][0].where.userId_macAddress.userId).toBe("internal");
  });
  it("creates missing devices with the server timestamp", async () => {
    record = null;
    await syncDeviceMetadata(db, payload, input({}));
    expect(db.device.create).toHaveBeenCalledTimes(1);
    expect(record.lastLoginAt).toBeInstanceOf(Date);
    expect(record).not.toHaveProperty("isBanned");
  });
  it("rejects mismatched devices", async () => {
    await expect(syncDeviceMetadata(db, payload, input({ deviceId: "other" }))).rejects.toMatchObject({ code: "DEVICE_MISMATCH", status: 401 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it.each(["USER", "DEVICE"])("rejects active %s bans", async target => {
    ban = { target };
    await expect(syncDeviceMetadata(db, payload, input({}))).rejects.toMatchObject({ status: 403 });
    expect(db.device.update).not.toHaveBeenCalled();
  });
  it("never clears an existing device ban flag", async () => {
    record.isBanned = true;
    await expect(syncDeviceMetadata(db, payload, input({}))).rejects.toMatchObject({ code: "DEVICE_BANNED" });
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
  it("rejects revoked sessions", async () => {
    user.sessionVersion = 1;
    await expect(syncDeviceMetadata(db, payload, input({}))).rejects.toThrow("SESSION_REVOKED");
    expect(db.device.update).not.toHaveBeenCalled();
  });
  it("trims and bounds fields, rejects blank identifiers", () => {
    expect(input({ location: "x".repeat(600), platform: "x".repeat(120), deviceName: "x".repeat(300) }).changes).toMatchObject({ location: "x".repeat(500), platform: "x".repeat(100), deviceName: "x".repeat(255) });
    expect(() => input({ deviceId: " " })).toThrow(expect.objectContaining({ status: 422 }));
    expect(deviceMetadataInput({ deviceId: "phone" }, new Headers()).changes).toEqual({});
  });
  it("retries serialization conflicts", async () => {
    db.$transaction.mockRejectedValueOnce({ code: "P2034" });
    expect(await syncDeviceMetadata(db, payload, input({}))).toEqual({ updated: true, seenAt: expect.any(String) });
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
