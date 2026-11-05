import { requirePagePermission } from '@/lib/portal-admin';
import { hasPermission } from '@/lib/portal-permissions';
import { prisma } from '@/lib/prisma';
import { cpLevelDto } from '@/lib/cp-levels';
import RoomManagementShell from '../components/room-management-shell';
import CpLevelManager from './cp-level-manager';
export default async function CpLevelsPage() {
  const admin = await requirePagePermission('cp.view');
  const [levels, assets] = await Promise.all([
    prisma.cpLevel.findMany({ orderBy: { level: 'asc' } }),
    prisma.uploadAsset.findMany({ where: { active: true, category: { in: ['FRAMES','ENTRANCES','BADGES','GIFTS','LIVE_GIFTS'] } }, select: { publicId: true, name: true, category: true }, orderBy: { name: 'asc' } }),
  ]);
  return <RoomManagementShell title="CP Levels"><CpLevelManager initial={levels.map(cpLevelDto)} assets={assets} canEdit={hasPermission(admin,'cp.edit')} /></RoomManagementShell>;
}
