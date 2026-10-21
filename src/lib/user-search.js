export function activeSearchSpecialId(now) {
  return { status: "ACTIVE", revokedAt: null, startsAt: { lte: now }, expiresAt: { gt: now } };
}

export async function searchUsers(db, callerId, query, now = new Date()) {
  const active = activeSearchSpecialId(now);
  const base = {
    deletedAt: null,
    status: "ACTIVE",
    bans: { none: { target: "USER", revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } },
    id: { not: callerId },
  };
  const select = {
    id: true, publicId: true, name: true, profileImage: true, gender: true, dob: true,
    isVerified: true, isOfficial: true, appRoles: true,
    specialIds: { where: active, select: { specialId: true }, orderBy: [{ startsAt: "desc" }, { id: "asc" }] },
  };
  const orderBy = [{ name: "asc" }, { publicId: "asc" }];
  // Fetch exact matches before applying the limit: sorting only the first 20
  // alphabetical results could otherwise drop an exact Special ID match.
  const exact = await db.user.findMany({
    where: { ...base, specialIds: { some: { ...active, specialId: { equals: query, mode: "insensitive" } } } },
    select, orderBy, take: 20,
  });
  const others = exact.length === 20 ? [] : await db.user.findMany({
    where: {
      ...base, id: { not: callerId, notIn: exact.map(u => u.id) },
      OR: [
        { publicId: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
        { specialIds: { some: { ...active, specialId: { contains: query, mode: "insensitive" } } } },
      ],
    }, select, orderBy, take: 20 - exact.length,
  });
  const lower = query.toLowerCase();
  return [...exact, ...others].map(({ specialIds, ...user }) => ({
    ...user,
    specialId: (specialIds.find(a => a.specialId.toLowerCase() === lower)
      ?? specialIds.find(a => a.specialId.toLowerCase().includes(lower))
      ?? specialIds[0])?.specialId ?? null,
  }));
}
