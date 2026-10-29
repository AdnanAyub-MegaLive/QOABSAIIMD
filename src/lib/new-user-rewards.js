import { validateReward } from './task-center-config.js';
import { grantTaskReward, validateRewardReferences, rewardDisplay } from './task-center-rewards.js';
import { ledgerData } from './wallet.js';
import { setTimeout as retryDelay } from 'node:timers/promises';
const DAY = 86400000;
const fail = (code, message, status = 409) => Object.assign(new Error(message), { code, status });
export function retryableRewardConflict(error) {
  if (['P2034', 'P2002'].includes(error?.code)) return true;
  if (error?.code !== 'P2010') return false;
  const pending = [error.meta], seen = new Set();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    if ([value.code, value.sqlState, value.originalCode].some(c => ['40001', '40P01'].includes(c)) || value.kind === 'TransactionWriteConflict') return true;
    pending.push(value.cause, value.driverAdapterError);
  }
  return false;
}
export function newUserDay(createdAt, now) {
  const elapsed = now.getTime() - createdAt.getTime();
  return elapsed < 0 || elapsed >= 7 * DAY ? null : Math.floor(elapsed / DAY) + 1;
}
export function validateNewUserPolicy(body) {
  if (typeof body?.enabled !== 'boolean' || !Array.isArray(body.rewards) || body.rewards.length !== 7 || !Number.isInteger(body.revision) || body.revision < 0)
    throw fail('VALIDATION_ERROR', 'Provide seven rewards, enabled state and current revision.', 422);
  return body.rewards.map(validateReward);
}
export async function saveNewUserPolicy(db, admin, body) {
  const rewards = validateNewUserPolicy(body);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030142)::text`;
    const latest = await tx.newUserRewardPolicy.findFirst({ orderBy: { id: 'desc' } });
    if ((latest?.id ?? 0) !== body.revision) throw fail('CONFIG_CONFLICT', 'Configuration changed. Reload before saving.');
    await validateRewardReferences(tx, rewards);
    const [{ now }] = await tx.$queryRaw`SELECT clock_timestamp() AS now`;
    const policy = await tx.newUserRewardPolicy.create({ data: { enabled: body.enabled, rewards, effectiveFrom: now } });
    await tx.auditLog.create({ data: { adminId: admin.id, action: 'NEW_USER_REWARDS_CONFIGURED', category: 'CONTENT_MANAGEMENT', entityType: 'NewUserRewardPolicy', entityId: String(policy.id), description: 'Published new-account login rewards for future registrations.', metadata: { enabled: body.enabled, rewards } } });
    return policy;
  });
}
async function policyFor(db, user) {
  return db.newUserRewardPolicy.findFirst({ where: { effectiveFrom: { lt: user.createdAt } }, orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }] });
}
export async function newUserRewardStatus(db, user, origin, now = new Date()) {
  const policy = await policyFor(db, user);
  const day = newUserDay(user.createdAt, now);
  if (!policy?.enabled) return { eligible: false, reason: 'NOT_ELIGIBLE', serverTime: now.toISOString(), days: [] };
  const claims = await db.newUserRewardClaim.findMany({ where: { userId: user.id }, select: { day: true } });
  return { eligible: day !== null, reason: day === null ? 'EXPIRED' : null, policyId: policy.id, currentDay: day,
    serverTime: now.toISOString(), expiresAt: new Date(user.createdAt.getTime() + 7 * DAY).toISOString(),
    days: await Promise.all(policy.rewards.map(async (reward, i) => ({ day: i + 1,
      opensAt: new Date(user.createdAt.getTime() + i * DAY).toISOString(), closesAt: new Date(user.createdAt.getTime() + (i + 1) * DAY).toISOString(),
      state: claims.some(c => c.day === i + 1) ? 'CLAIMED' : day === null || i + 1 < day ? 'MISSED' : i + 1 === day ? 'AVAILABLE' : 'LOCKED',
      reward: await rewardDisplay(db, reward, origin) }))) };
}
export async function claimNewUserReward(db, identity, day) {
  if (!Number.isInteger(day) || day < 1 || day > 7) throw fail('VALIDATION_ERROR', 'Choose a day from 1 to 7.', 422);
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${identity.id} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: identity.id } });
      if (!user || user.deletedAt || user.status !== 'ACTIVE' || user.sessionVersion !== identity.sessionVersion) throw fail('SESSION_REVOKED', 'Please sign in again.', 401);
      const previous = await tx.newUserRewardClaim.findUnique({ where: { userId_day: { userId: user.id, day } } });
      if (previous) return previous.result;
      const [{ now }] = await tx.$queryRaw`SELECT clock_timestamp() AS now`;
      const policy = await policyFor(tx, user);
      if (!policy?.enabled) throw fail('NOT_ELIGIBLE', 'This account is not eligible for new-user rewards.');
      const currentDay = newUserDay(user.createdAt, now);
      if (currentDay === null || day < currentDay) throw fail('REWARD_EXPIRED', 'This reward window has expired.');
      if (day > currentDay) throw fail('REWARD_NOT_READY', 'This reward day has not opened yet.');
      const reward = policy.rewards[day - 1];
      const claim = await tx.newUserRewardClaim.create({ data: { userId: user.id, day, policyId: policy.id, result: {} } });
      const coins = await grantTaskReward(tx, user.id, reward, claim.id, now);
      const updated = await tx.user.update({ where: { id: user.id }, data: { coinBalance: { increment: coins } }, select: { coinBalance: true } });
      await tx.walletTransaction.create({ data: ledgerData({ userId: user.id, type: 'BONUS', direction: 'CREDIT', title: `New-user day ${day}`, coins, referenceId: claim.id, metadata: { source: 'NEW_USER_LOGIN', day, policyId: policy.id, reward } }) });
      const result = { claimId: claim.id, day, reward, coinBalance: updated.coinBalance.toString(), claimedAt: now.toISOString() };
      await tx.newUserRewardClaim.update({ where: { id: claim.id }, data: { result } });
      await tx.auditLog.create({ data: { action: 'NEW_USER_REWARD_CLAIMED', category: 'USER_MANAGEMENT', entityType: 'User', entityId: user.publicId, description: `Claimed new-user day ${day}.`, metadata: { claimId: claim.id, policyId: policy.id, reward } } });
      return result;
    }, { isolationLevel: 'Serializable' }); }
    catch (error) {
      if (!retryableRewardConflict(error)) throw error;
      if (attempt === 2) throw fail('RETRY_REQUIRED', 'Please retry the same reward day.', 503);
      await retryDelay(25 * (attempt + 1));
    }
  }
}
