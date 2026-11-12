import { randomUUID } from "node:crypto";
export async function notifyLiveFollowers(db, live) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`video-alert:${live.hostId}`}))::text AS locked`;
    const previous = await tx.videoLiveAlertCooldown.findUnique({ where: { hostId: live.hostId } });
    const now = new Date();
    if (previous && +now - +previous.sentAt < 30 * 60 * 1000) return 0;
    const [followers, blocks, bans, invites] = await Promise.all([
      tx.userFollow.findMany({ where: { followedId: live.hostId, follower: { status: "ACTIVE", deletedAt: null } }, select: { followerId: true } }),
      tx.userBlock.findMany({ where: { OR: [{ blockerId: live.hostId }, { blockedId: live.hostId }] }, select: { blockerId: true, blockedId: true } }),
      tx.videoLiveBan.findMany({ where: { sessionId: live.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { userId: true } }),
      live.privacyMode === "PRIVATE" ? tx.videoLiveInvite.findMany({ where: { sessionId: live.id }, select: { userId: true } }) : [],
    ]);
    const denied = new Set([...blocks.map(b => b.blockerId === live.hostId ? b.blockedId : b.blockerId), ...bans.map(b => b.userId)]), invited = new Set(invites.map(i => i.userId));
    const recipients = followers.filter(f => !denied.has(f.followerId) && (live.privacyMode !== "PRIVATE" || invited.has(f.followerId)));
    const action = { screen: "LIVE_VIDEO", liveId: live.publicId, host: { publicId: live.host.publicId, name: live.host.name, profileImage: live.host.profileImage }, title: live.title, coverUrl: live.coverUrl };
    let count = 0;
    for (let i = 0; i < recipients.length; i += 500) {
      const result = await tx.notification.createMany({ skipDuplicates: true, data: recipients.slice(i, i + 500).map(({ followerId: userId }) => ({ userId, publicId: `NOT-${randomUUID().replaceAll("-", "").toUpperCase()}`, sourceKey: `${userId}:live-start:${live.publicId}`, type: "LIVE_FOLLOWED_STARTED", title: "Live now", body: `${live.host.name} is live: ${live.title}`, action })) });
      count += result.count;
    }
    if (count) await tx.videoLiveAlertCooldown.upsert({ where: { hostId: live.hostId }, create: { hostId: live.hostId, sentAt: now }, update: { sentAt: now } });
    return count;
  }, { timeout: 30000 });
}
