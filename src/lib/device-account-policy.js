const fail = (code, message, status = 403) => Object.assign(new Error(message), { code, status });

// Signup binding is independent of login history. Null userId means signup.
export async function assertDeviceAccount(tx, deviceId, userId = null) {
  if (typeof deviceId !== "string" || !deviceId.trim() || deviceId.length > 255)
    throw fail("VALIDATION_ERROR", "A device identifier of 1–255 characters is required.", 422);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${deviceId}, 0))::text`;
  const records = await tx.device.findMany({ where: { macAddress: deviceId }, select: { userId: true, isBanned: true } });
  if (records.some(row => row.isBanned)) throw fail("DEVICE_BANNED", "This device has been banned.");
  if (userId === null) {
    const registration = await tx.user.findUnique({ where: { signupDeviceId: deviceId }, select: { id: true } });
    if (registration) throw fail("DEVICE_ACCOUNT_CONFLICT", "An account has already been created on this device.", 409);
  }
}

export async function replaceMobileSession(db, userId, deviceId) {
  return db.$transaction(async tx => {
    await assertDeviceAccount(tx, deviceId, userId);
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt || user.status !== "ACTIVE")
      throw fail("SESSION_REVOKED", "This account is not active.", 401);
    const ban = await tx.ban.findFirst({ where: { userId, target: "USER", revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
    if (ban) throw fail("ACCOUNT_BANNED", "This account has been banned.");
    return tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  });
}

export function disconnectReplacedSessions(user) {
  // Filter by version so a concurrent, newer login is never disconnected.
  globalThis.portalRevokeOlderSessions?.(user.publicId, user.sessionVersion);
}
