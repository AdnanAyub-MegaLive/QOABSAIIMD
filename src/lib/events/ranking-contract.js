import { calendarWindow } from '../business-time.js';
import { moduleCycle } from '../reporting-cycles.js';
export const eventRankingTypes = ['wealth', 'charm', 'agency', 'cp', 'game', 'weekly-star'];
export function rankingWindow(period, now = new Date()) {
  if (!['today','week','month'].includes(period)) throw Object.assign(new Error('Choose Daily, Weekly or Monthly.'), { code: 'VALIDATION_ERROR' });
  const { start, end } = calendarWindow(period === 'today' ? 'day' : period, now);
  return { start, end };
}
export function rankingInput(params) {
  const type = params.get('type') || 'wealth', period = params.get('period') || 'today';
  const offset = Number(params.get('offset') || 0), q = (params.get('q') || '').trim();
  if (!eventRankingTypes.includes(type) || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000 || q.length > 80)
    throw Object.assign(new Error('Invalid ranking filter.'), { code: 'VALIDATION_ERROR' });
  if(type==='weekly-star' && period!=='week') throw Object.assign(new Error('Weekly Star uses weekly periods.'),{code:'VALIDATION_ERROR'});
  rankingWindow(period);
  return { type, period, offset, q };
}

export async function configuredRankingWindow(db, type, period, now = new Date()) {
  return period === 'month' ? moduleCycle(db, `${type.toUpperCase()}_RANKING`, now) : rankingWindow(period, now);
}
