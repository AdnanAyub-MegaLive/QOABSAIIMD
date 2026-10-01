import { requirePagePermission } from "@/lib/portal-admin";
import RoomManagementShell from "../components/room-management-shell";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import NotificationManager from "./notification-manager";

export default async function NotificationsManagementPage() {
  await requirePagePermission("notifications.view");
  const session = await auth();
  if (!session?.user) redirect("/");
  return <RoomManagementShell title="Notification Center"><NotificationManager/></RoomManagementShell>;
}
