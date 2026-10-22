export function utcDayStart(value = new Date()) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())); }
export function utcWeekStart(value = new Date()) { const d = utcDayStart(value); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d; }
export function periodStart(definition, now) {
  if (definition.cadence === "BEGINNER") return new Date(0);
  if (definition.cadence === "MONTHLY") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return definition.cadence === "WEEKLY" ? utcWeekStart(now) : utcDayStart(now);
}
