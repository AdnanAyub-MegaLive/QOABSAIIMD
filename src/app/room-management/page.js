import { requirePagePermission } from "@/lib/portal-admin";
import RoomManagementShell from "../components/room-management-shell";
import { redirect } from "next/navigation";import { auth } from "../../../auth";import RoomManagementConsole from "./room-management-console";export default async function Page(){await requirePagePermission("rooms.view");
  const session=await auth();if(!session?.user)redirect("/");return <RoomManagementShell title="Audio Room Control Center"><RoomManagementConsole/></RoomManagementShell>}
