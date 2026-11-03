import { Prisma } from '@prisma/client';
import { notifyAction } from './action-notifications.js';
import { prettyWeek, WEEK_MS, qualification, policyForWeek, prettyError } from './pretty-id-policy.js';

// Count settled ledger credits at their original settlement time. Gifts, bonuses,
// admin adjustments and business-wallet funding do not satisfy this predicate.
export function prettyRechargeSql(start, end, userId = null, after = '', limit = 100) {
  return Prisma.sql`SELECT w."userId", SUM(CASE WHEN w.type='COIN_TOP_UP' THEN o."baseCoins" ELSE w.coins END)::bigint AS coins
    FROM "WalletTransaction" w
    LEFT JOIN "WalletTopUpOrder" o ON w.type='COIN_TOP_UP' AND o."publicId"=w."referenceId" AND o."userId"=w."userId"
    WHERE w."createdAt">=${start} AND w."createdAt"<${end}
      AND w.status='COMPLETED' AND w.direction='CREDIT' AND w.coins>0
      AND (${userId}::text IS NULL OR w."userId"=${userId}) AND w."userId">${after}
      AND ((w.type='COIN_TOP_UP' AND o.status='COMPLETED' AND o."baseCoins">0)
        OR (w.type='TRANSFER_RECEIVED' AND w.metadata->>'wallet'='PERSONAL'
          AND EXISTS (SELECT 1 FROM "WalletTransaction" d WHERE d."referenceId"=w."referenceId"
            AND d.type='TRANSFER_SENT' AND d.status='COMPLETED' AND d.direction='DEBIT'
            AND d.metadata->>'wallet'='BUSINESS' AND d.coins=w.coins)))
    GROUP BY w."userId" ORDER BY w."userId" LIMIT ${limit}`;
}
export async function weeklyAllowance(db, userId, start, end) {
  const rows = await db.$queryRaw(prettyRechargeSql(start, end, userId));
  const used = await db.prettyIdMaintenance.aggregate({ where: { weekStart: start, accepted: true, grant: { userId } }, _sum: { coins: true } });
  const recharge = BigInt(rows[0]?.coins ?? 0), allocated = used._sum.coins ?? 0n;
  return { recharge, allocated, available: recharge > allocated ? recharge - allocated : 0n };
}
export async function lockPrettyUser(tx, userId) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { publicId: true, status: true, deletedAt: true } });
  if (!user || user.status !== 'ACTIVE' || user.deletedAt) prettyError('SESSION_REVOKED', 'Account unavailable.', 401);
  return user;
}
export async function prettyWeeklyStatus(db, userId, now = new Date()) {
  const { start, end } = prettyWeek(now), policy = await policyForWeek(db, start);
  const allowance = await weeklyAllowance(db, userId, start, end);
  const grants = await db.prettyIdGrant.findMany({ where: { userId, maintenanceCoins: { gt: 0 }, assignment: { status: { in: ['ACTIVE', 'OWNED'] }, revokedAt: null, expiresAt: { gt: now } } }, include: { assignment: true, maintenance: { where: { weekStart: start } } }, orderBy: [{ maintenanceCoins: 'asc' }, { id: 'asc' }] });
  return { weekStart: start.toISOString(), weekEnd: end.toISOString(), serverTime: now.toISOString(), enabled: policy?.enabled ?? false,
    rechargeCoins: allowance.recharge.toString(), allocatedCoins: allowance.allocated.toString(), availableCoins: allowance.available.toString(),
    levels: policy?.levels ?? [],
    maintenanceOffers: policy?.enabled ? grants.filter(g => !g.maintenance.length && g.maintenanceCoins <= allowance.available).map(g => ({ grantId: g.id, specialId: g.assignment.specialId, level: g.level, maintenanceCoins: g.maintenanceCoins.toString(), durationMinutes: g.durationMinutes, expiresAt: g.assignment.expiresAt })) : [] };
}

// Called after recharge commit. Notification failure never affects the credit;
// the authenticated GET also exposes all outstanding offers for recovery.
export async function notifyPrettyMaintenance(db, userId) {
  const status = await prettyWeeklyStatus(db, userId);
  for (const offer of status.maintenanceOffers) {
    await notifyAction(db, { userId, key: `pretty-maintain:${offer.grantId}:${status.weekStart}`, type: 'PRETTY_ID_MAINTENANCE',
      title: 'Maintain your Pretty ID?', body: `You can allocate ${offer.maintenanceCoins} weekly recharge coins to extend ${offer.specialId}. Your wallet will not be charged.`,
      action: { screen: 'PRETTY_IDS', grantId: offer.grantId, weekStart: status.weekStart } });
  }
}
export async function decidePrettyMaintenance(db, userId, grantId, weekStart, accepted) {
  if (typeof grantId !== 'string' || typeof accepted !== 'boolean' || typeof weekStart !== 'string' || !Number.isFinite(Date.parse(weekStart)))
    prettyError('VALIDATION_ERROR', 'Provide grantId, weekStart and accepted.', 422);
  return db.$transaction(async tx => {
    // Match claim/activation and the assignment trigger's lock order.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030140)::text AS locked`;
    await lockPrettyUser(tx, userId);
    await tx.$queryRaw`SELECT a.id FROM "SpecialIdAssignment" a JOIN "PrettyIdGrant" g ON g."assignmentId"=a.id WHERE g.id=${grantId} AND g."userId"=${userId} FOR UPDATE OF a`;
    const grant = await tx.prettyIdGrant.findFirst({ where: { id: grantId, userId }, include: { assignment: true } });
    if (!grant) prettyError('PRETTY_ID_UNAVAILABLE', 'This ID is unavailable.');
    const requestedWeek = new Date(weekStart);
    const previous = await tx.prettyIdMaintenance.findUnique({ where: { grantId_weekStart: { grantId, weekStart: requestedWeek } } });
    if (previous) {
      if (previous.accepted !== accepted) prettyError('IDEMPOTENCY_CONFLICT', 'This week’s decision has already been saved.');
      return { grantId, accepted, allocatedCoins: previous.coins.toString(), expiresAt: previous.expiresAt };
    }
    // Capture time AFTER the lock: a delayed decision cannot spend a closed week.
    const now = new Date(), { start, end } = prettyWeek(now);
    if (+requestedWeek !== +start) prettyError('WEEK_CLOSED', 'Refresh your current week before choosing.');
    const policy = await policyForWeek(tx, start);
    if (!policy?.enabled) prettyError('PRETTY_IDS_DISABLED', 'Weekly Pretty IDs are not enabled for this week.');
    const assignment = grant.assignment;
    if (!assignment || !['ACTIVE', 'OWNED'].includes(assignment.status) || assignment.revokedAt || !assignment.expiresAt || assignment.expiresAt <= now || grant.maintenanceCoins <= 0n)
      prettyError('NOT_RENEWABLE', 'This ID cannot be maintained.');
    const allowance = await weeklyAllowance(tx, userId, start, end);
    if (allowance.available < grant.maintenanceCoins) prettyError('INSUFFICIENT_RECHARGE', 'Your remaining weekly recharge allowance is too low.');
    const expiresAt = accepted ? new Date(+assignment.expiresAt + grant.durationMinutes * 60000) : assignment.expiresAt;
    if (accepted) await tx.specialIdAssignment.update({ where: { id: assignment.id }, data: { expiresAt } });
    const coins = accepted ? grant.maintenanceCoins : 0n;
    await tx.prettyIdMaintenance.create({ data: { grantId, weekStart: start, accepted, coins, expiresAt } });
    return { grantId, accepted, allocatedCoins: coins.toString(), expiresAt };
  }, { isolationLevel: 'ReadCommitted' });
}

let running = false;
export async function maintainPrettyIds(db) {
  if (running) return;
  running = true;
  try {
    const first = await db.prettyIdPolicy.findFirst({ orderBy: { effectiveFrom: 'asc' } });
    if (!first) return;
    const current = prettyWeek().start;
    const last = await db.prettyIdWeek.findFirst({ orderBy: { start: 'desc' } });
    const start = last ? (last.completedAt ? new Date(+last.start + WEEK_MS) : last.start) : first.effectiveFrom;
    if (start >= current || Date.now() < +start + WEEK_MS + 300000) return;
    await db.$transaction(async tx => {
      // One small page per tick; multiple server processes share this lock.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030141)::text AS locked`;
      const week = await tx.prettyIdWeek.upsert({ where: { start }, create: { start }, update: {} });
      if (week.completedAt) return;
      const policy = await policyForWeek(tx, start), end = new Date(+start + WEEK_MS);
      const rows = policy?.enabled ? await tx.$queryRaw(prettyRechargeSql(start, end, null, week.cursor, 50)) : [];
      for (const row of rows) {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${row.userId} FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id: row.userId }, select: { status: true, deletedAt: true } });
        if (!user || user.status !== 'ACTIVE' || user.deletedAt) continue;
        if (await tx.prettyIdGrant.findUnique({ where: { userId_weekStart: { userId: row.userId, weekStart: start } } })) continue;
        const used = await tx.prettyIdMaintenance.aggregate({ where: { weekStart: start, accepted: true, grant: { userId: row.userId } }, _sum: { coins: true } });
        const level = qualification(policy.levels, BigInt(row.coins), used._sum.coins ?? 0n);
        if (!level) continue;
        const grant = await tx.prettyIdGrant.create({ data: { userId: row.userId, weekStart: start, source: 'WEEKLY_RECHARGE', level: level.level, pattern: level.pattern, durationMinutes: level.durationDays * 1440, maintenanceCoins: BigInt(level.maintenanceCoins) } });
        await notifyAction(tx, { userId: row.userId, key: `pretty-week:${start.toISOString()}`, type: 'PRETTY_ID', title: 'Your Pretty ID is ready', body: `Your weekly recharge unlocked a ${level.characters}-character ID. Claim it and activate it when ready.`, action: { screen: 'PRETTY_IDS', grantId: grant.id } });
      }
      await tx.prettyIdWeek.update({ where: { start }, data: { cursor: rows.at(-1)?.userId ?? week.cursor, ...(rows.length < 50 ? { completedAt: new Date() } : {}) } });
    }, { isolationLevel: 'ReadCommitted', timeout: 30000 });
  } finally { running = false; }
}
