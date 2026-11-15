import { requirePagePermission } from '@/lib/portal-admin';
import RoomManagementShell from '../components/room-management-shell';
import DeletionManager from './deletion-manager';
export default async function Page(){await requirePagePermission('users.delete');return <RoomManagementShell title="Account deletion requests"><DeletionManager /></RoomManagementShell>;}
