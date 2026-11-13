import { calendarWindow } from './business-time.js';
export const WEEK_MS = 7 * 86400000;
export function prettyWeek(now = new Date()) { const {start,end}=calendarWindow('week',now); return {start,end}; }
export const defaultPrettyLevels = [1000000, 5000000, 10000000, 15000000, 25000000].map((coins, i) => ({
  level: i + 1, characters: 7 - i, thresholdCoins: String(coins),
  pattern: ['BBBCCCC', 'BBBCCC', 'BBCCC', 'BBCC', 'BCC'][i],
  maintenanceCoins: '0', durationDays: 30,
}));
export function prettyError(code, message, status = 409) {
  throw Object.assign(new Error(message), { code, status });
}
export function validatePrettyLevels(levels) {
  if (!Array.isArray(levels) || levels.length !== 5) prettyError('VALIDATION_ERROR', 'Configure all five levels.', 422);
  let previous = 0n;
  return levels.map((row, i) => {
    const amount = value => typeof value === 'string' && /^\d{1,19}$/.test(value) && BigInt(value) <= 9223372036854775807n;
    if (!amount(row.thresholdCoins) || BigInt(row.thresholdCoins) <= previous || !amount(row.maintenanceCoins) ||
        typeof row.pattern !== 'string' || !/^[A-Z]{3,7}$/.test(row.pattern) || row.pattern.length !== 7 - i ||
        !Number.isInteger(row.durationDays) || row.durationDays < 1 || row.durationDays > 36500)
      prettyError('VALIDATION_ERROR', 'Use increasing positive thresholds, nonnegative maintenance, matching patterns and 1–36500 validity days.', 422);
    previous = BigInt(row.thresholdCoins);
    return { level: i + 1, characters: 7 - i, thresholdCoins: previous.toString(), maintenanceCoins: BigInt(row.maintenanceCoins).toString(), pattern: row.pattern, durationDays: row.durationDays };
  });
}
export function qualification(levels, recharge, allocated) {
  const available = recharge > allocated ? recharge - allocated : 0n;
  return [...levels].reverse().find(row => available >= BigInt(row.thresholdCoins)) ?? null;
}
export const policyForWeek = (db, start) => db.prettyIdPolicy.findFirst({ where: { effectiveFrom: { lte: start } }, orderBy: { effectiveFrom: 'desc' } });
