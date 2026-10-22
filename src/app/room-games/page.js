import { requirePagePermission } from "@/lib/portal-admin";
import RoomManagementShell from "../components/room-management-shell";
import { redirect } from "next/navigation";
import { requirePortalAdmin } from "@/lib/portal-admin";
import RoomGames from "./room-games";

export default async function Page() {
  const admin = await requirePagePermission("roomGames.view");
  if (!await requirePortalAdmin()) redirect("/");
  return <RoomManagementShell title="Room Games"><RoomGames canArchive={admin.role==='SUPER_ADMIN'} /></RoomManagementShell>;
}
