import { randomInt } from 'node:crypto';

export const rocketError = (code, message, status = 422) => Object.assign(new Error(message), { code, status });
export const rocketJson = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v));
export function rocketCoins(value) {
  if (!/^\d+$/.test(String(value)) || BigInt(value) < 1n || BigInt(value) > 9223372036854775807n) throw rocketError('VALIDATION_ERROR', 'Use a positive whole-number Coin amount within the supported range.');
  return String(BigInt(value));
}
function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw rocketError('VALIDATION_ERROR', `Use an integer between ${min} and ${max}.`);
  return value;
}
function url(value) {
  if (!value) return null;
  try { const parsed = new URL(value); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return parsed.href; } catch {}
  throw rocketError('VALIDATION_ERROR', 'Media must use an HTTPS URL.');
}
export function validateRocketConfig(input) {
  if (typeof input?.enabled !== 'boolean' || !Array.isArray(input.stages) || input.stages.length !== 3) throw rocketError('VALIDATION_ERROR', 'Configure exactly three Rocket levels.');
  const endsAt = new Date(input.endsAt);
  if (!Number.isFinite(endsAt.getTime())) throw rocketError('VALIDATION_ERROR', 'Set a valid first season end date.');
  const title = String(input.title ?? '').trim(), rules = String(input.rules ?? '');
  if (!title || title.length > 100 || rules.length > 10000) throw rocketError('VALIDATION_ERROR', 'Provide a title (up to 100 characters) and rules (up to 10,000).');
  const stages = input.stages.map((stage, i) => {
    const rewards = Object.fromEntries(['top1', 'top2', 'top3', 'inRoom'].map(group => {
      const list = stage.rewards?.[group] ?? [];
      if (!Array.isArray(list) || list.length > 10) throw rocketError('VALIDATION_ERROR', 'Each reward group supports up to ten rewards.');
      return [group, list.map((r, index) => {
        const rewardId = `LV-${i + 1}-${group}-${index + 1}`;
        if (r.type === 'COINS') return { rewardId, type: 'COINS', amount: rocketCoins(r.amount), name: 'Coins', iconUrl: url(r.iconUrl), text: `${rocketCoins(r.amount)} Coins` };
        if (!['PROP', 'GIFT'].includes(r.type) || typeof r.assetId !== 'string' || !/^AST-[A-Za-z0-9-]+$/.test(r.assetId)) throw rocketError('VALIDATION_ERROR', 'Choose a prop or gift public asset ID.');
        const amount = integer(Number(r.amount), 1, r.type === 'PROP' ? 3650 : 10000);
        return { rewardId, type: r.type, assetId: r.assetId, amount: String(amount) };
      })];
    }));
    return { id: `LV-${i + 1}`, level: i + 1, title: String(stage.title || `Rocket LV.${i + 1}`).slice(0, 100), targetCoins: rocketCoins(stage.targetCoins), thumbnailUrl: url(stage.thumbnailUrl), previewUrl: url(stage.previewUrl), mimeType: String(stage.mimeType || 'video/mp4'), animation: { mediaUrl: url(stage.animation?.mediaUrl), mimeType: String(stage.animation?.mimeType || 'video/mp4'), lowResolutionMediaUrl: url(stage.animation?.lowResolutionMediaUrl), posterUrl: url(stage.animation?.posterUrl), durationMs: integer(Number(stage.animation?.durationMs ?? 5000), 100, 120000), avatarTrack: null }, inRoomWinners: integer(Number(stage.inRoomWinners ?? 0), 0, 100), rewards };
  });
  return { resetDelayMinutes: integer(Number(input.resetDelayMinutes ?? 180), 1, 10080), enabled: input.enabled, title, rules, endsAt: endsAt.toISOString(), repeatDays: integer(Number(input.repeatDays), 1, 366), stages };
}
// Allocate the recorded debit, never a catalog price. The same sender owns all carryover.
export function allocateRocketCoins(stages, level, currentCoins, paidCoins) {
  let current = BigInt(currentCoins), remaining = BigInt(paidCoins), next = level;
  const allocations = [];
  while (remaining > 0n && next <= stages.length) {
    const target = BigInt(stages[next - 1].targetCoins);
    const amount = remaining < target - current ? remaining : target - current;
    if (amount > 0n) allocations.push({ level: next, amount, launch: current + amount === target });
    current += amount; remaining -= amount;
    if (current < target || next === stages.length) break;
    next++; current = 0n;
  }
  return { allocations, level: next, currentCoins: current };
}
export function drawRocketWinners(ids, excluded, count, rng = randomInt) {
  const pool = [...new Set(ids)].filter(id => !excluded.includes(id));
  for (let i = pool.length - 1; i > 0; i--) { const j = rng(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, count);
}
export function rocketPercentage(current, target) { return Number(BigInt(current) * 100n / BigInt(target)); }
