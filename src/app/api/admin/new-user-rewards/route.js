import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/portal-admin';
import { sameOrigin } from '@/lib/game-control/http';
import { saveNewUserPolicy } from '@/lib/new-user-rewards';
export async function POST(request) {
  try {
    sameOrigin(request);
    const admin = await requirePermission('tasks.manage');
    if (admin.role !== 'SUPER_ADMIN') return Response.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Platform Admin can configure new-user rewards.' } }, { status: 403 });
    const policy = await saveNewUserPolicy(prisma, admin, await request.json().catch(() => null));
    return Response.json({ success: true, data: policy }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ success: false, error: { code: error.code ?? 'NEW_USER_CONFIG_FAILED', message: error.status ? error.message : 'Unable to save configuration.' } }, { status: error.status ?? 500 });
  }
}
