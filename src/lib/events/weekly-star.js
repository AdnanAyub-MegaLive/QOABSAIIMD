import { rankingWindow } from './ranking-contract.js';
import { EventModuleError } from './errors.js';

export function weeklyStarInput(input, now = new Date()) {
  const start = new Date(`${input.week}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.week || '') || !Number.isFinite(+start) || start.toISOString().slice(0,10)!==input.week || start.getUTCDay()!==1 || start<rankingWindow('week',now).end)
    throw new EventModuleError('VALIDATION_ERROR','Choose an upcoming Monday (UTC). Started weeks cannot be changed.',422);
  if (!Array.isArray(input.giftIds) || input.giftIds.length>20 || input.giftIds.some(id=>typeof id!=='string'||!id||id.length>100) || new Set(input.giftIds).size!==input.giftIds.length)
    throw new EventModuleError('VALIDATION_ERROR','Choose up to 20 distinct gifts.',422);
  return { startsAt:start, giftIds:input.giftIds };
}
