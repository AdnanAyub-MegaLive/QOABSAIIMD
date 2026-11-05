// Calendar boundaries are UTC, start inclusive and end exclusive. Policies are
// append-only so historical reports and reward receipts keep their old window.
export const cycleModules = {
  HOST_SALARY: 'Host earnings / salary reports',
  AGENCY_COMMISSION: 'Agency commission and targets',
  MANAGEMENT_SALARY: 'Management business reports',
  WEALTH_RANKING: 'Wealth ranking and rewards',
  CHARM_RANKING: 'Charm ranking and rewards',
  AGENCY_RANKING: 'Agency ranking and rewards',
  GAME_RANKING: 'Game ranking and rewards',
  CP_RANKING: 'CP ranking and rewards',
};
export function calendarCycle(at, days = 30) {
  const date = new Date(at);
  if (!Number.isFinite(+date) || ![15, 30].includes(days)) throw new Error('Invalid cycle.');
  const year = date.getUTCFullYear(), month = date.getUTCMonth();
  const second = days === 15 && date.getUTCDate() >= 16;
  const start = new Date(Date.UTC(year, month, second ? 16 : 1));
  const end = days === 15 && !second ? new Date(Date.UTC(year, month, 16)) : new Date(Date.UTC(year, month + 1, 1));
  const monthKey = start.toISOString().slice(0, 7);
  return { start, end, month: monthKey, key: monthKey + (days === 15 ? second ? '-H2' : '-H1' : ''), days,
    timezone: 'UTC', label: days === 15 ? second ? '16th–month-end' : '1st–15th' : 'Calendar month' };
}
export function cycleFromPolicies(policies, at) {
  const policy = policies.filter(p => +new Date(p.effectiveFrom) <= +at).sort((a,b) => +new Date(b.effectiveFrom) - +new Date(a.effectiveFrom) || b.revision-a.revision)[0];
  return { ...calendarCycle(at, policy?.days ?? 30), revision: policy?.revision ?? 0 };
}
export async function moduleCycle(db, module, at = new Date()) {
  if (!cycleModules[module]) throw new Error('Unknown cycle module.');
  const policies = await db.reportingCyclePolicy.findMany({ where: { module, effectiveFrom: { lte: at } }, orderBy: { effectiveFrom: 'desc' }, take: 1 });
  return cycleFromPolicies(policies, at);
}
export async function reportCycle(db, module, selection, now = new Date()) {
  const value = selection || now.toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])(?:-H[12])?$/.test(value) || value.slice(0,7) < '2000-01' || value.slice(0,7) > now.toISOString().slice(0,7))
    throw Object.assign(new Error('Choose a valid month and optional H1/H2 cycle.'), { status: 422, code: 'VALIDATION_ERROR' });
  const month = value.slice(0,7), half = value.slice(8);
  const day = half === 'H2' ? '16' : half === 'H1' ? '01' : month === now.toISOString().slice(0,7) && now.getUTCDate() >= 16 ? '16' : '01';
  const result = await moduleCycle(db, module, new Date(`${month}-${day}T00:00:00Z`));
  if (half && result.days !== 15) throw Object.assign(new Error('This month uses a calendar-month cycle.'), { status: 422, code: 'VALIDATION_ERROR' });
  return { ...result, policyKey: result.key };
}
export function publicCycle(cycle) {
  return { key: cycle.key, days: cycle.days, label: cycle.label, revision: cycle.revision, timezone: 'UTC', start: cycle.start.toISOString(), endExclusive: cycle.end.toISOString(), nextResetAt: cycle.end.toISOString() };
}
export async function saveCycle(db, admin, input, now = new Date()) {
  if (admin?.role !== 'SUPER_ADMIN' || !admin.active) throw Object.assign(new Error('Only Platform Admin can change cycles.'), { status: 403 });
  if (!cycleModules[input.module] || ![15,30].includes(input.days) || !Number.isSafeInteger(input.revision) || input.revision < 0)
    throw Object.assign(new Error('Choose a module, 15/30 days and the current revision.'), { status: 422 });
  return db.$transaction(async tx => {
    const rows = await tx.reportingCyclePolicy.findMany({ where: { module: input.module }, orderBy: { revision: 'desc' } });
    if ((rows[0]?.revision ?? 0) !== input.revision) throw Object.assign(new Error('Cycle settings changed. Reload before saving.'), { status: 409 });
    if (rows.some(r => +r.effectiveFrom > +now)) throw Object.assign(new Error('A change is already scheduled for this module. It must take effect before another change.'), { status: 409 });
    const current = cycleFromPolicies(rows, now);
    if (current.days === input.days) throw Object.assign(new Error('This cycle is already active.'), { status: 422 });
    // A monthly cycle must start on the 1st, never halfway through an old month.
    const effectiveFrom = input.days === 30 ? calendarCycle(now,30).end : current.end;
    const policy = await tx.reportingCyclePolicy.create({ data: { module: input.module, days: input.days, revision: input.revision + 1, effectiveFrom, createdById: admin.id } });
    await tx.auditLog.create({ data: { adminId: admin.id, category: 'FINANCE', action: 'REPORTING_CYCLE_SCHEDULED', entityType: 'ReportingCyclePolicy', entityId: policy.id, description: `Scheduled ${cycleModules[input.module]} calendar cycle.`, metadata: { module: input.module, days: input.days, effectiveFrom: effectiveFrom.toISOString(), previousDays: current.days } } });
    return policy;
  }, { isolationLevel: 'Serializable' });
}
