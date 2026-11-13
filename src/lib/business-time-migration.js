import { calendarWindow, calendarSelection } from './business-time.js';
import { moduleCycle } from './reporting-cycles.js';

// Only unstarted, UTC-midnight configurations move. Receipts, completed rounds,
// wallet records, expiry timestamps and in-progress periods are never rewritten.
export async function alignBusinessSchedules(db, now = new Date()) {
  const cutover = process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE_CUTOVER_AT;
  if (!cutover || !Number.isFinite(Date.parse(cutover))) throw Error('Set the permanent business timezone cutover before deployment.');
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(7202601)::text`;
    const changes = [];
    async function align(model, field, key, kind) {
      const rows = await tx[model].findMany({ where: { [field]: { gt: now } } });
      for (const row of rows) {
        const value = row[field];
        if (!value.toISOString().endsWith('T00:00:00.000Z')) continue;
        const period = typeof kind === 'function' ? await kind(row) : kind;
        const start = new Date(Math.max(...(Array.isArray(period) ? period : [period]).map(kind => +calendarSelection(kind,value.toISOString().slice(0,10)).start)));
        if (+start === +value || start <= now) continue;
        await tx[model].update({ where: { [key]: row[key] }, data: { [field]: start } });
        changes.push({ model, id: String(row[key]), before: value.toISOString(), after: start.toISOString() });
      }
    }
    await align('weeklyStarWeek', 'startsAt', 'startsAt', 'week');
    await align('prettyIdPolicy', 'effectiveFrom', 'id', 'week');
    await align('roomRewardPolicy', 'effectiveFrom', 'version', 'day');
    await align('reportingCyclePolicy', 'effectiveFrom', 'id', async r => {
      const previous = await tx.reportingCyclePolicy.findMany({where:{module:r.module,effectiveFrom:{lte:new Date(+r.effectiveFrom-1)}},orderBy:{effectiveFrom:'desc'},take:1});
      return [r.days === 15 ? 'halfmonth' : 'month', previous[0]?.days === 15 ? 'halfmonth' : 'month'];
    });
    const moduleKind = async (module, at) => (await moduleCycle(tx,module,at)).days === 15 ? 'halfmonth' : 'month';
    await align('hostSalarySchedule', 'effectiveFrom', 'effectiveFrom', r => moduleKind('HOST_SALARY',r.effectiveFrom));
    await align('rankingRewardPolicy', 'effectiveFrom', 'id', r => r.period === 'today' ? 'day' : r.period === 'week' ? 'week' : moduleKind(`${r.track.toUpperCase()}_RANKING`,r.effectiveFrom));
    // The first activation/control pointer may itself be a future UTC boundary.
    await align('roomRewardActivation', 'startsAt', 'id', 'day');
    await align('hostSalaryControl', 'nextCloseStart', 'id', r => moduleKind('HOST_SALARY',r.nextCloseStart));
    if (changes.length) await tx.auditLog.create({ data: { category: 'SYSTEM', action: 'BUSINESS_TIMEZONE_SCHEDULES_ALIGNED', entityType: 'BusinessTimezone', entityId: cutover, description: 'Aligned unstarted calendar settings to UTC+7.', metadata: { cutover, changes } } });
    return { cutover, timezone: calendarWindow('day',now).timezone, aligned: changes.length };
  }, { isolationLevel: 'Serializable', timeout: 30000 });
}
