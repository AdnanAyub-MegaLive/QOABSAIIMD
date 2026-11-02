import { requirePermission } from '@/lib/portal-admin';
import { prisma } from '@/lib/prisma';
import { saveRocketConfiguration } from '@/lib/room-rocket';
export async function GET() {
  try {
    await requirePermission('rocket.view');
    const [settings, season] = await Promise.all([prisma.roomRocketSettings.findUnique({ where: { id: 'GLOBAL' } }), prisma.roomRocketSeason.findFirst({ orderBy: { endsAt: 'desc' } })]);
    return Response.json({ success: true, data: { settings, season } }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}
export async function PUT(request) {
  try {
    const admin = await requirePermission('rocket.edit');
    const body = await request.json().catch(() => { throw Object.assign(new Error('Send a valid JSON configuration.'), { status: 422, code: 'VALIDATION_ERROR' }); });
    const config = await prisma.$transaction(async tx => {
      const saved = await saveRocketConfiguration(tx, body);
      await tx.auditLog.create({ data: { adminId: admin.id, action: 'ROOM_ROCKET_CONFIGURED', category: 'CONTENT_MANAGEMENT', entityType: 'RoomRocketSettings', entityId: 'GLOBAL', description: 'Updated Rocket switch and next-season configuration.', metadata: saved } });
      return saved;
    });
    return Response.json({ success: true, data: config });
  } catch (error) { return failure(error); }
}
function failure(error) { if (!error.status) console.error('Room Rocket administration failed', error.code ?? error.name); return Response.json({ success: false, error: { code: error.code ?? 'ROCKET_CONFIGURATION_FAILED', message: error.status ? error.message : 'Unable to save Rocket settings.' } }, { status: error.status ?? 500 }); }
