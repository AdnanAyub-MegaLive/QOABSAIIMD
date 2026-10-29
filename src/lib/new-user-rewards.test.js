import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ grant: vi.fn() }));
vi.mock('./task-center-rewards.js', () => ({ grantTaskReward: m.grant, validateRewardReferences: async () => {}, rewardDisplay: async (_, r) => r }));
vi.mock('./wallet.js', () => ({ ledgerData: x => x }));
import { newUserDay, newUserRewardStatus, claimNewUserReward, validateNewUserPolicy, saveNewUserPolicy, retryableRewardConflict } from './new-user-rewards.js';
const createdAt = new Date('2026-11-01T13:23:00Z');
const rewards = Array.from({ length: 7 }, (_, i) => ({ kind: 'COINS', coins: String(i + 1) }));
let db, user, now, claims;
beforeEach(() => {
  vi.clearAllMocks(); now = new Date(createdAt); claims = [];
  user = { id: 'new-user', publicId: 'USR-test', createdAt, status: 'ACTIVE', sessionVersion: 1 };
  db = {
    $queryRaw: vi.fn(async () => [{ now }]),
    user: { findUnique: vi.fn(async () => user), update: vi.fn(async () => ({ coinBalance: 101n })) },
    newUserRewardPolicy: { findFirst: vi.fn(async () => ({ id: 1, enabled: true, rewards })) },
    newUserRewardClaim: {
      findMany: vi.fn(async () => claims), findUnique: vi.fn(async ({ where }) => claims.find(c => c.day === where.userId_day.day)),
      create: vi.fn(async ({ data }) => { const row = { id: 'claim', ...data }; claims.push(row); return row; }),
      update: vi.fn(async ({ data }) => Object.assign(claims[0], data)),
    }, walletTransaction: { create: vi.fn() }, auditLog: { create: vi.fn() },
  };
  db.$transaction = vi.fn(async fn => fn(db)); m.grant.mockResolvedValue(1n);
});
it('uses exact account-relative windows and expires at 168 hours', () => {
  expect(newUserDay(createdAt, createdAt)).toBe(1);
  expect(newUserDay(createdAt, new Date(+createdAt + 86400000 - 1))).toBe(1);
  expect(newUserDay(createdAt, new Date(+createdAt + 86400000))).toBe(2);
  expect(newUserDay(createdAt, new Date(+createdAt + 7 * 86400000 - 1))).toBe(7);
  expect(newUserDay(createdAt, new Date(+createdAt + 7 * 86400000))).toBeNull();
});
it('selects only policy published before registration, not latest global settings', async () => {
  await newUserRewardStatus(db, user, null, now);
  expect(db.newUserRewardPolicy.findFirst).toHaveBeenCalledWith({ where: { effectiveFrom: { lt: createdAt } }, orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }] });
});
it.each([null, { enabled: false }])('excludes old accounts and accounts created while disabled', async policy => {
  db.newUserRewardPolicy.findFirst.mockResolvedValue(policy);
  expect((await newUserRewardStatus(db, user, null, now)).eligible).toBe(false);
  await expect(claimNewUserReward(db, user, 1)).rejects.toMatchObject({ code: 'NOT_ELIGIBLE' });
  expect(m.grant).not.toHaveBeenCalled();
});
it('claims once and replays the original receipt without another grant', async () => {
  const first = await claimNewUserReward(db, user, 1);
  now = new Date(+createdAt + 9 * 86400000);
  expect(await claimNewUserReward(db, user, 1)).toEqual(first);
  expect(m.grant).toHaveBeenCalledTimes(1);
  expect(db.user.update).toHaveBeenCalledTimes(1);
  expect(db.walletTransaction.create).toHaveBeenCalledTimes(1);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
});
it('missed days are lost without resetting the day number', async () => {
  now = new Date(+createdAt + 2 * 86400000);
  await expect(claimNewUserReward(db, user, 1)).rejects.toMatchObject({ code: 'REWARD_EXPIRED' });
  await expect(claimNewUserReward(db, user, 4)).rejects.toMatchObject({ code: 'REWARD_NOT_READY' });
  expect((await claimNewUserReward(db, user, 3)).reward.coins).toBe('3');
});
it('rejects expired campaigns and invalid days', async () => {
  now = new Date(+createdAt + 7 * 86400000);
  await expect(claimNewUserReward(db, user, 7)).rejects.toMatchObject({ code: 'REWARD_EXPIRED' });
  await expect(claimNewUserReward(db, user, 8)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(db.user.update).not.toHaveBeenCalled();
});
it('rechecks account/session status under the user lock', async () => {
  db.user.findUnique.mockResolvedValue({ ...user, sessionVersion: 2 });
  await expect(claimNewUserReward(db, user, 1)).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  expect(m.grant).not.toHaveBeenCalled();
});
it('retries rolled-back serialization conflicts', async () => {
  db.$transaction.mockRejectedValueOnce({ code: 'P2034' });
  expect((await claimNewUserReward(db, user, 1)).day).toBe(1);
  expect(m.grant).toHaveBeenCalledTimes(1);
});
it('requires seven valid admin-configurable rewards', () => {
  expect(validateNewUserPolicy({ revision: 0, enabled: true, rewards })).toEqual(rewards);
  expect(() => validateNewUserPolicy({ revision: 0, enabled: true, rewards: [] })).toThrow();
});
it('rejects stale admin updates', async () => {
  await expect(saveNewUserPolicy(db, { id: 'admin' }, { enabled: true, rewards, revision: 0 })).rejects.toMatchObject({ code: 'CONFIG_CONFLICT' });
});
it('recognizes pg adapter serialization conflicts but not unrelated SQL errors', () => {
  expect(retryableRewardConflict({code:'P2010',meta:{driverAdapterError:{cause:{originalCode:'40001'}}}})).toBe(true);
  expect(retryableRewardConflict({code:'P2010',meta:{code:'42703'}})).toBe(false);
});
