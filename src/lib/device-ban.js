export async function assertSessionDevice(db, userId, deviceId) {
  if (!deviceId) return; // Legacy sessions retain their existing compatibility policy.
  const device = await db.device.findUnique({
    where: { userId_macAddress: { userId, macAddress: deviceId } }, select: { id: true },
  });
  if (!device) throw new Error("DEVICE_NOT_REGISTERED");
  const banned = await db.device.findFirst({ where: { macAddress: deviceId, isBanned: true }, select: { id: true } });
  if (banned) throw new Error("DEVICE_BANNED");
}

export async function changeDeviceBan(db, admin, { publicId, macAddress, reason, permanent, durationMinutes, proofImage }, banned) {
  const minutes = permanent ? null : Number(durationMinutes);
  if (!publicId || !macAddress || !reason?.trim() || (banned && !permanent && (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 5256000))) {
    throw Object.assign(new Error("Select a device, enter a reason and choose a valid ban duration."), { status: 422 });
  }
  return db.$transaction(async tx => {
    // Same identifier lock as signup/login: a login cannot slip between the ban writes.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${macAddress}, 0))::text`;
    const user = await tx.user.findUnique({ where: { publicId }, select: { id: true } });
    const talent = user ? null : await tx.talent.findUnique({ where: { publicId }, select: { id: true } });
    const selected = (user || talent) && await tx.device.findFirst({ where: { macAddress, ...(user ? { userId: user.id } : { talentId: talent.id }) } });
    if (!selected) throw Object.assign(new Error("This account's device record could not be found. Refresh and try again."), { status: 404 });
    const devices = await tx.device.findMany({ where: { macAddress }, select: { id: true, userId: true, talentId: true } });
    const now = new Date();
    const expiresAt = banned && minutes ? new Date(now.getTime() + minutes * 60000) : null;
    const ids = devices.map(device => device.id);
    let accounts = [];
    const talentIds = [...new Set(devices.flatMap(device => device.talentId ? [device.talentId] : []))];
    if (banned) {
      await tx.ban.createMany({ data: ids.map(deviceId => ({ target: "DEVICE", deviceId, adminId: admin.id, reason: reason.trim(), durationMinutes: minutes, expiresAt, proofImage: proofImage || null })) });
      // Device rows are retained across logins: include past users, not just the
      // latest login or the account selected in the Portal. Signup is also a link.
      const userIds = [...new Set(devices.flatMap(device => device.userId ? [device.userId] : []))];
      accounts = await tx.user.findMany({
        where: { OR: [{ id: { in: userIds } }, { signupDeviceId: macAddress }] },
        select: { id: true, publicId: true }, orderBy: { id: "asc" },
      });
      const accountReason = `Device ban: ${reason.trim()}`;
      const accountBans = [
        ...accounts.map(account => ({ userId: account.id })),
        ...talentIds.map(talentId => ({ talentId })),
      ].map(owner => ({ ...owner, target: "USER", adminId: admin.id, reason: accountReason, durationMinutes: minutes, expiresAt, proofImage: proofImage || null }));
      if (accountBans.length) await tx.ban.createMany({ data: accountBans });
      if (accounts.length) await tx.user.updateMany({
        where: { id: { in: accounts.map(account => account.id) } },
        data: { status: "BANNED", sessionVersion: { increment: 1 }, forcedLogoutAt: now },
      });
      if (talentIds.length) await tx.talent.updateMany({ where: { id: { in: talentIds } }, data: { status: "BANNED" } });
    } else {
      await tx.ban.updateMany({ where: { deviceId: { in: ids }, target: "DEVICE", revokedAt: null }, data: { revokedAt: now } });
    }
    await tx.device.updateMany({ where: { macAddress }, data: { isBanned: banned } });
    await tx.auditLog.create({ data: {
      adminId: admin.id, action: banned ? "BAN_DEVICE" : "UNBAN_DEVICE", category: "SECURITY",
      entityType: "Device", entityId: selected.id,
      description: `${admin.name} ${banned ? "banned" : "unbanned"} device for ${publicId}`,
      metadata: { publicId, macAddress, reason: reason.trim(), affectedDevices: ids.length, durationMinutes: minutes,
        bannedAccounts: accounts.map(account => account.publicId), bannedTalentIds: banned ? talentIds : [] },
    } });
    return { macAddress, reason: reason.trim(), banExpiresAt: expiresAt?.toISOString() ?? null,
      bannedAccountIds: accounts.map(account => account.publicId) };
  });
}

export async function disconnectBannedDevice(io, deviceId, data) {
  const { bannedAccountIds = [], ...deviceData } = data;
  const accounts = new Set(bannedAccountIds);
  const sockets = await io.fetchSockets();
  for (const socket of sockets) {
    const sameDevice = socket.data.deviceId === deviceId;
    if (!sameDevice && !accounts.has(socket.data.userId)) continue;
    if (sameDevice) socket.emit("device:banned", { success: true, data: deviceData });
    if (accounts.has(socket.data.userId)) socket.emit("account:banned", { success: true, data: {
      isBanned: true, banReason: `Device ban: ${data.reason}`, banExpiresAt: data.banExpiresAt,
    } });
    socket.disconnect(true);
  }
}
