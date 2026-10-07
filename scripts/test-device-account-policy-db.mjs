import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { assertDeviceAccount, replaceMobileSession } from "../src/lib/device-account-policy.js";
config({ path: ".env.local", quiet: true });
const { prisma } = await import("../src/lib/prisma.js");
const rollback = new Error("ROLLBACK_TEST");
try {
  await prisma.$transaction(async tx => {
    const db = new Proxy(tx, { get: (object, key) => key === "$transaction" ? fn => fn(tx) : object[key] });
    const deviceId = `test-${randomUUID()}`;
    const user = await tx.user.create({ data: { publicId: `USR-${randomUUID()}`, name: "Device policy test", status: "ACTIVE" } });
    await assertDeviceAccount(tx, deviceId);
    await tx.device.create({ data: { userId: user.id, macAddress: deviceId } });
    await assertDeviceAccount(tx, deviceId, "other-user");
    await assertDeviceAccount(tx, deviceId);
    await tx.user.update({ where: { id: user.id }, data: { signupDeviceId: deviceId } });
    await assert.rejects(assertDeviceAccount(tx, deviceId), { code: "DEVICE_ACCOUNT_CONFLICT" });
    await assertDeviceAccount(tx, deviceId, "other-user");
    const first = await replaceMobileSession(db, user.id, deviceId);
    const second = await replaceMobileSession(db, user.id, deviceId);
    assert.equal(second.sessionVersion, first.sessionVersion + 1);
    throw rollback;
  }, { timeout: 15000 });
} catch (error) {
  if (error !== rollback) throw error;
  console.log("PASS: database device lock, conflicting accounts, and session replacement; fixtures rolled back.");
} finally { await prisma.$disconnect(); }
