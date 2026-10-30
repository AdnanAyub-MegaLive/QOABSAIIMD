// Matches the recorder's three missed 15-second presence heartbeats.
export const AUDIO_MIC_GRACE_MS = 45_000;

export async function audioMicAttendance(db, userId, period, now) {
  const sessions = await db.audioRoomMicSession.findMany({ where: {
    userId, startedAt: { lt: period.end }, OR: [{ endedAt: null }, { endedAt: { gt: period.start } }],
  }, select: { startedAt: true, endedAt: true, lastSeenAt: true } });
  return sessions.map(session => ({ startedAt: session.startedAt,
    endedAt: session.endedAt ?? new Date(Math.min(+now, +session.lastSeenAt + AUDIO_MIC_GRACE_MS)),
  }));
}
