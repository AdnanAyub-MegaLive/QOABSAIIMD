import RoomManagementShell from "../components/room-management-shell";
import { redirect } from "next/navigation";
import { requirePortalAdmin } from "@/lib/portal-admin";
import RoomGames from "./room-games";

export default async function Page() {
  if (!await requirePortalAdmin()) redirect("/");
  return <RoomManagementShell title="Room Games"><RoomGames /></RoomManagementShell>;
}
