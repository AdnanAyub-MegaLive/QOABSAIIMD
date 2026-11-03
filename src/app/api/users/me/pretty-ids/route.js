import { prisma } from '@/lib/prisma';
import { mobileJson, mobileApiError, mobileOptions, requireMobileUser } from '@/lib/mobile-api';
import { isRateLimited } from '@/lib/rate-limit';
import { listPrettyIds, claimPrettyId, activatePrettyId } from '@/lib/pretty-id';
import { prettyWeeklyStatus, decidePrettyMaintenance } from '@/lib/pretty-id-weekly';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;
async function reply(data, status = 200) {
  const response = await mobileJson(data, status);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
function failure(error) {
  if (error.status) return reply({ success: false, error: { code: error.code, message: error.message } }, error.status);
  return mobileApiError(error, 'PRETTY_ID_REQUEST_FAILED');
}
export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    if (isRateLimited(`pretty-read:${user.id}`, { limit: 30, windowMs: 60000 })) return reply({ success: false, error: { code: 'RATE_LIMITED', message: 'Refresh again shortly.' } }, 429);
    return reply({ success: true, data: { ...(await prettyWeeklyStatus(prisma, user.id)), grants: await listPrettyIds(prisma, user.id) } });
  } catch (error) { return failure(error); }
}
export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    if (isRateLimited(`pretty-write:${user.id}`, { limit: 20, windowMs: 60000 })) return reply({ success: false, error: { code: 'RATE_LIMITED', message: 'Try again shortly.' } }, 429);
    let body; try { body = await request.json(); } catch { body = null; }
    if (!body || typeof body.grantId !== 'string' || !['CLAIM', 'ACTIVATE', 'MAINTAIN'].includes(body.action)) return reply({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Provide action and grantId.' } }, 422);
    const data = body.action === 'CLAIM' ? await claimPrettyId(prisma, user.id, body.grantId, body.code)
      : body.action === 'ACTIVATE' ? await activatePrettyId(prisma, user.id, body.grantId)
      : await decidePrettyMaintenance(prisma, user.id, body.grantId, body.weekStart, body.accepted);
    try {
      if (body.action === 'ACTIVATE') {
        globalThis.portalIo?.to(`user:${user.publicId}`).emit('special-id:assigned', { success: true, data: { ...data, effectiveId: data.specialId, source: 'PRETTY_ID' } });
        globalThis.portalScheduleSpecialIdExpiry?.(data.assignmentId, new Date(data.expiresAt));
      }
      globalThis.portalIo?.to(`user:${user.publicId}`).emit('pretty-id:updated', { success: true, data: { grantId: body.grantId } });
    } catch (error) { console.error('Pretty ID post-commit delivery failed', error.name); }
    return reply({ success: true, data });
  } catch (error) { return failure(error); }
}
