export const eventRankingTypes = ['wealth', 'charm', 'agency', 'cp'];
export function rankingWindow(period, now = new Date()) {
  const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
  if (period === 'week') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  else if (period === 'month') start.setUTCDate(1);
  else if (period !== 'today') throw Object.assign(new Error('Choose Daily, Weekly or Monthly.'), { code: 'VALIDATION_ERROR' });
  const end = new Date(start);
  if (period === 'month') end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCDate(end.getUTCDate() + (period === 'week' ? 7 : 1));
  return { start, end };
}
export function rankingInput(params) {
  const type = params.get('type') || 'wealth', period = params.get('period') || 'today';
  const offset = Number(params.get('offset') || 0), q = (params.get('q') || '').trim();
  if (!eventRankingTypes.includes(type) || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000 || q.length > 80)
    throw Object.assign(new Error('Invalid ranking filter.'), { code: 'VALIDATION_ERROR' });
  rankingWindow(period);
  return { type, period, offset, q };
}
