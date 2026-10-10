import { assertDeviceAccount } from "./device-account-policy.js";
import { assertMobileSession } from "./mobile-session-state.js";
import { observedDeviceIp, observedDeviceLocation } from "./device-observation.js";

const clean = (value, n) => typeof value === "string" && value.trim() ? value.trim().slice(0, n) : null;
const fail = (code, message, status) => Object.assign(new Error(message), { code, status });

export function deviceMetadataInput(body, headers) {
  const deviceId = clean(body?.deviceId, 255);
  if (!deviceId) throw fail("VALIDATION_ERROR", "A non-blank deviceId is required.", 422);
  const changes = {};
  for (const [key, limit] of [["location", 500], ["platform", 100], ["deviceName", 255]]) {
    if (Object.hasOwn(body, key)) {
      if (key === "location") { const location = observedDeviceLocation(body[key]); if (location) changes.location = location; }
      else changes[key] = clean(body[key], limit);
    }
  }
  const ip = clean(headers.get("x-forwarded-for")?.split(",")[0], 255) || clean(headers.get("x-real-ip"), 255);
  // No proxy header is not evidence that an existing IP should be erased.
  if (observedDeviceIp(ip)) changes.lastLoginIp = observedDeviceIp(ip);
  return { deviceId, changes };
}

export async function syncDeviceMetadata(db, payload, input) {
  if (payload.deviceId && payload.deviceId !== input.deviceId) {
    throw fail("DEVICE_MISMATCH", "This session belongs to another device.", 401);
  }
  // Serializable retry handles concurrent initial syncs without duplicate rows
  // and prevents writing against a concurrently changed session/ban snapshot.
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const user = await tx.user.findUnique({ where: { publicId: payload.userId } });
        assertMobileSession(user, payload);
        const active = { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
        const ban = await tx.ban.findFirst({ where: { ...active, userId: user.id, target: "USER" } });
        if (ban) throw fail("ACCOUNT_BANNED", "This account has been banned.", 403);
        await assertDeviceAccount(tx, input.deviceId, user.id);
        const where = { userId_macAddress: { userId: user.id, macAddress: input.deviceId } };
        const device = await tx.device.findUnique({ where });
        const deviceBan = device && await tx.ban.findFirst({ where: { ...active, deviceId: device.id, target: "DEVICE" } });
        if (device?.isBanned || deviceBan) throw fail("DEVICE_BANNED", "This device has been banned.", 403);
        const changed = Object.fromEntries(Object.entries(input.changes).filter(([key, value]) => !device || device[key] !== value));
        const now = new Date();
        const updated = !device || Object.keys(changed).length > 0;
        const record = device
          ? await tx.device.update({ where, data: { ...changed, lastLoginAt: now } })
          : await tx.device.create({ data: { userId: user.id, macAddress: input.deviceId, ...changed, lastLoginAt: now } });
        if (Object.keys(changed).length) await tx.auditLog.create({ data: {
          action: "DEVICE_METADATA_UPDATED", category: "AUTHENTICATION", entityType: "Device", entityId: record.id,
          description: `Device metadata refreshed for ${user.publicId}.`,
          ipAddress: input.changes.lastLoginIp ?? null,
          metadata: { source: "MOBILE_APP", userId: user.publicId, deviceId: input.deviceId, created: !device, changedFields: Object.keys(changed) },
        } });
        return { updated, seenAt: now.toISOString() };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (attempt < 2 && ["P2034", "P2002"].includes(error.code)) continue;
      throw error;
    }
  }
}
