"use server";
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/portal-admin';
import { prettyWeek, defaultPrettyLevels, validatePrettyLevels } from '@/lib/pretty-id-policy';
import { notifyAction } from '@/lib/action-notifications';

export async function readPrettyPolicy() {
  await requirePermission('users.specialIds');
  const policies = await prisma.prettyIdPolicy.findMany({ orderBy: { effectiveFrom: 'desc' }, take: 10 });
  return { policies: policies.map(p => ({ ...p, effectiveFrom: p.effectiveFrom.toISOString(), createdAt: p.createdAt.toISOString() })), defaults: defaultPrettyLevels, nextWeek: prettyWeek().end.toISOString() };
}
export async function savePrettyPolicy(enabled, levels) {
  const admin = await requirePermission('users.specialIds');
  if (typeof enabled !== 'boolean') return { success: false, message: 'Select whether weekly qualification is enabled.' };
  let checked;
  try { checked = validatePrettyLevels(levels); } catch (error) { return { success: false, message: error.message }; }
  const policy = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030142)::text AS locked`;
    const effectiveFrom = prettyWeek().end;
    const row = await tx.prettyIdPolicy.upsert({ where: { effectiveFrom }, create: { effectiveFrom, enabled, levels: checked }, update: { enabled, levels: checked } });
    await tx.auditLog.create({ data: { adminId: admin.id, action: 'PRETTY_ID_POLICY_SCHEDULED', category: 'USER_MANAGEMENT', entityType: 'PrettyIdPolicy', entityId: String(row.id), description: `Weekly Pretty ID policy scheduled for ${effectiveFrom.toISOString()}`, metadata: { enabled, levels: checked } } });
    return row;
  });
  return { success: true, message: `Saved for ${policy.effectiveFrom.toISOString()}. Current weeks and existing ID terms are unchanged.` };
}
export async function grantPrettyLevel(publicId, level, requestKey) {
  const admin = await requirePermission('users.specialIds');
  if (typeof publicId !== 'string' || !Number.isInteger(level) || level < 1 || level > 5 || !/^[a-zA-Z0-9-]{8,64}$/.test(requestKey ?? ''))
    return { success: false, message: 'Enter an account and choose a level.' };
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030140)::text AS locked`;
    const user = await tx.user.findUnique({ where: { publicId: publicId.trim() }, select: { id: true, deletedAt: true, status: true } });
    if (!user || user.deletedAt || user.status !== 'ACTIVE') return { success: false, message: 'Active account not found.' };
    const id = `manual-${admin.id}-${requestKey}`;
    const replay = await tx.prettyIdGrant.findUnique({ where: { id } });
    if (replay) return { success: replay.userId === user.id && replay.level === level, message: replay.userId === user.id && replay.level === level ? 'Entitlement already granted.' : 'This request was already used for another grant.' };
    const policy = await tx.prettyIdPolicy.findFirst({ orderBy: { effectiveFrom: 'desc' } });
    if (!policy) return { success: false, message: 'Save the five level configurations first.' };
    const selected = policy.levels.find(row => row.level === level);
    await tx.prettyIdGrant.create({ data: { id, userId: user.id, source: 'MANUAL', level, pattern: selected.pattern, durationMinutes: selected.durationDays * 1440, maintenanceCoins: BigInt(selected.maintenanceCoins) } });
    await notifyAction(tx, { userId: user.id, key: id, type: 'PRETTY_ID', title: 'Pretty ID granted', body: `An official granted you a ${selected.characters}-character Pretty ID. Activate it when ready.`, action: { screen: 'PRETTY_IDS', grantId: id } });
    await tx.auditLog.create({ data: { adminId: admin.id, action: 'PRETTY_ID_GRANTED', category: 'USER_MANAGEMENT', entityType: 'User', entityId: user.id, description: `Manual Pretty ID level ${level} granted.`, metadata: { grantId: id, policyId: policy.id } } });
    return { success: true, message: 'Entitlement granted. Validity starts on first activation.' };
  });
}
