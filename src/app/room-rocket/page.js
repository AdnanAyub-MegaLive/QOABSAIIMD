import { requirePagePermission } from '@/lib/portal-admin';
import { hasPermission } from '@/lib/portal-permissions';
import { prisma } from '@/lib/prisma';
import RoomManagementShell from '../components/room-management-shell';
import RocketManager from './rocket-manager';

export default async function RoomRocketPage() {
  const admin = await requirePagePermission('rocket.view');
  const [settings, season, assets] = await Promise.all([
    prisma.roomRocketSettings.findUnique({ where: { id: 'GLOBAL' } }),
    prisma.roomRocketSeason.findFirst({ orderBy: { endsAt: 'desc' } }),
    prisma.uploadAsset.findMany({ where: { active: true }, select: { publicId: true, name: true, category: true }, orderBy: { name: 'asc' } }),
  ]);
  return <RoomManagementShell title="Room Rocket"><RocketManager initial={settings?.config ?? null} enabled={settings?.enabled ?? false} season={season ? { id: season.id, endsAt: season.endsAt.toISOString() } : null} assets={assets} canEdit={hasPermission(admin, 'rocket.edit')} /></RoomManagementShell>;
}
