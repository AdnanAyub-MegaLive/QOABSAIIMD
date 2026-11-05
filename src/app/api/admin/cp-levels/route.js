import { requirePermission } from '@/lib/portal-admin';
import { prisma } from '@/lib/prisma';
import { cpLevelDto, saveCpLevel } from '@/lib/cp-levels';
export async function PUT(request) {
  try {
    const admin = await requirePermission('cp.edit');
    const body = await request.json();
    const level = await prisma.$transaction(tx => saveCpLevel(tx, body, admin.id), { isolationLevel: 'Serializable', timeout: 60000 });
    return Response.json({ success: true, data: { level: cpLevelDto(level) } });
  } catch (error) {
    if (error.code === 'P2034') return Response.json({ success: false, error: { code: 'CP_CONFIGURATION_CONFLICT', message: 'CP activity changed while saving. Please retry.' } }, { status: 409 });
    if (!error.status) console.error('CP configuration failed', error.code ?? error.name);
    return Response.json({ success: false, error: { code: error.code ?? 'CP_CONFIGURATION_FAILED', message: error.status ? error.message : 'Unable to save CP level.' } }, { status: error.status ?? 500 });
  }
}
