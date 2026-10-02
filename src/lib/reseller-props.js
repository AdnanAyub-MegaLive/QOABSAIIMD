// Only remove entitlements created by this role; retain purchases and manual grants.
export async function syncResellerProps(userId, client) {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { appRoles: true, deletedAt: true },
  });
  const eligible = user && !user.deletedAt && user.appRoles.includes("RESELLER")
    ? await client.uploadAsset.findMany({
        where: { active: true, distribution: "RESELLER" },
        select: { id: true, defaultGrantDurationMinutes: true },
      })
    : [];
  await client.uploadAssetAssignment.deleteMany({
    where: { userId, source: "RESELLER", assetId: { notIn: eligible.map((asset) => asset.id) } },
  });
  const now = new Date();
  for (const asset of eligible) {
    const durationMinutes = asset.defaultGrantDurationMinutes;
    await client.uploadAssetAssignment.upsert({
      where: { assetId_userId: { assetId: asset.id, userId } },
      // Do not replace independent ownership or restart a timed grant on each request.
      update: {},
      create: {
        assetId: asset.id, userId, source: "RESELLER", sourceReference: "ROLE_RESELLER",
        assignedAt: now, durationMinutes,
        expiresAt: durationMinutes ? new Date(now.getTime() + durationMinutes * 60000) : null,
      },
    });
  }
}
