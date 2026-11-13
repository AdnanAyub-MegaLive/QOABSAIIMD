// Instants remain UTC in storage. Calendar periods and Portal wall-clock inputs
// use Bangkok (UTC+7, without daylight saving).
export const PORTAL_TIMEZONE = 'Asia/Bangkok';
export const PORTAL_TIME_LABEL = 'UTC+7';
const OFFSET = 7 * 3600000;

function windowAt(kind, value, offset) {
  const d = new Date(+new Date(value) + offset);
  if (!Number.isFinite(+d)) throw new Error('Invalid calendar date.');
  let y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  if (kind === 'week') day -= (d.getUTCDay() + 6) % 7;
  else if (kind === 'month') day = 1;
  else if (kind === 'halfmonth') day = day < 16 ? 1 : 16;
  else if (kind !== 'day') throw new Error('Invalid calendar period.');
  const wallStart = new Date(Date.UTC(y, m, day));
  const wallEnd = new Date(wallStart);
  if (kind === 'month' || kind === 'halfmonth' && day === 16) wallEnd.setUTCMonth(wallEnd.getUTCMonth() + 1, 1);
  else wallEnd.setUTCDate(wallEnd.getUTCDate() + (kind === 'week' ? 7 : kind === 'halfmonth' ? 15 : 1));
  const date = wallStart.toISOString().slice(0, 10);
  return { start: new Date(+wallStart - offset), end: new Date(+wallEnd - offset), date,
    key: kind === 'month' ? date.slice(0, 7) : kind === 'halfmonth' ? `${date.slice(0, 7)}-H${day === 16 ? 2 : 1}` : date,
    timezone: offset ? PORTAL_TIMEZONE : 'UTC' };
}

// Deployment persists this once. Finish the old period first, then shorten the
// first UTC+7 period by seven hours: no double counting and no missing activity.
export function calendarWindow(kind, value = new Date(), cutover = process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE_CUTOVER_AT) {
  if (!cutover) return windowAt(kind, value, OFFSET);
  const transition = calendarTransition(kind,cutover);
  if (+new Date(value) < +transition) return windowAt(kind, value, 0);
  const result = windowAt(kind, value, OFFSET);
  if (result.start < transition) result.start = transition;
  return result;
}
export function calendarTransition(kind, cutover = process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE_CUTOVER_AT) {
  if (!cutover) return new Date('1970-01-01T00:00:00Z');
  const at = new Date(cutover);
  if (!Number.isFinite(+at)) throw new Error('Invalid business timezone cutover.');
  const old = windowAt(kind, at, 0);
  return +old.start === +at ? old.start : old.end;
}
export function calendarDate(value = new Date()) { return calendarWindow('day', value).date; }
export function portalDate(value = new Date()) { return new Date(+new Date(value) + OFFSET).toISOString().slice(0, 10); }
export function portalDateTimeInput(value) { return value ? new Date(+new Date(value) + OFFSET).toISOString().slice(0, 16) : ''; }
export function parsePortalDate(value) {
  if (typeof value !== 'string') return new Date(NaN);
  // Offset-bearing API values are already absolute instants.
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+07:00` : /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}+07:00`);
}
export function calendarSelection(kind, date) {
  // Noon belongs to the intended calendar date on either side of cutover.
  return calendarWindow(kind, new Date(`${date}T12:00:00Z`));
}
export function portalFormat(value, locales = 'en-US', options = {}) {
  if (value == null) return '';
  return new Date(value).toLocaleString(locales, { ...options, timeZone: PORTAL_TIMEZONE });
}
