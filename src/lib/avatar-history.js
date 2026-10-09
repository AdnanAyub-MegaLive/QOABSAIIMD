export function avatarDisplayUrl(value, origin) {
  if (typeof value !== "string" || !value.trim()) return null;
  if (/^avatar:[a-z0-9_-]+$/i.test(value)) return value;
  // Only web display URLs, never device URIs, data URIs or filesystem paths.
  if (!/^https?:\/\//i.test(value) && !/^\/(?:api\/|uploads\/|images\/)/.test(value)) return null;
  try {
    const url = new URL(value, origin);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export async function updateProfileWithHistory(db, userId, data, beforeUpdate = async () => {}) {
  return db.$transaction(async tx => {
    // Serialize all profile changes for this user so simultaneous edits cannot
    // lose the picture immediately preceding them.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: userId } });
    if (!current) throw new Error("SESSION_REVOKED");
    if (Object.hasOwn(data, "profileImage") && data.profileImage !== current.profileImage) {
      if (current.profileImage) {
        const last = await tx.userAvatarHistory.findFirst({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
        if (last?.imageUrl !== current.profileImage) await tx.userAvatarHistory.create({ data: { userId, imageUrl: current.profileImage, createdAt: new Date(Math.max(Date.now(), (last?.createdAt?.getTime() ?? 0) + 1)) } });
      }
      const settings = await tx.userProfileSettings.findUnique({ where: { id: "default" } });
      const limit = Math.max(1, Math.min(20, settings?.avatarHistoryLimit ?? 20));
      const oldest = await tx.userAvatarHistory.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: limit, select: { id: true } });
      if (oldest.length) await tx.userAvatarHistory.deleteMany({ where: { userId, id: { in: oldest.map(row => row.id) } } });
    }
    await beforeUpdate(tx);
    return tx.user.update({ where: { id: userId }, data });
  });
}

export async function readAvatarHistory(db, userId, origin) {
  return db.$transaction(async tx => {
    const current = await tx.user.findUnique({ where: { id: userId }, select: { profileImage: true } });
    const rows = await tx.userAvatarHistory.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20 });
    const equipped = avatarDisplayUrl(current?.profileImage, origin);
    return rows.flatMap(row => {
      const imageUrl = avatarDisplayUrl(row.imageUrl, origin);
      return imageUrl && imageUrl !== equipped ? [{ id: row.id, imageUrl, createdAt: row.createdAt.toISOString() }] : [];
    });
  }, { isolationLevel: "RepeatableRead" });
}
