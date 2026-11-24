import { hasPermission } from '@/lib/portal-permissions';
import { requirePagePermission } from "@/lib/portal-admin";
import RoomManagementShell from "../components/room-management-shell";
import { redirect } from "next/navigation";
import { requirePortalAdmin } from "@/lib/portal-admin";
import RoomGames from "./room-games";
import TulasiGames from "./tulasi-games";

export default async function Page() {
  const admin = await requirePagePermission("roomGames.view");
  if (!await requirePortalAdmin()) redirect("/");
  return <RoomManagementShell title="Room Games"><RoomGames canCreate={hasPermission(admin,"roomGames.create")} canEdit={hasPermission(admin,"roomGames.edit")} canArchive={hasPermission(admin,"roomGames.delete")} /><TulasiGames canManage={hasPermission(admin,"roomGames.edit")} /></RoomManagementShell>;
}
