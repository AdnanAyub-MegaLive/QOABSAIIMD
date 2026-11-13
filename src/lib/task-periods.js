import { calendarWindow } from './business-time.js';
// Compatibility names retained for existing callers; boundaries follow the business calendar.
export function utcDayStart(value = new Date()) { return calendarWindow('day', value).start; }
export function utcWeekStart(value = new Date()) { return calendarWindow('week', value).start; }
export function periodStart(definition, now) {
  if (definition.cadence === 'BEGINNER') return new Date(0);
  return calendarWindow(definition.cadence === 'MONTHLY' ? 'month' : definition.cadence === 'WEEKLY' ? 'week' : 'day', now).start;
}
