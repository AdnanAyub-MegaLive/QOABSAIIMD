import { requirePagePermission } from "@/lib/portal-admin";
import RoomManagementShell from "../components/room-management-shell";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import NotificationManager from "./notification-manager";
import WelcomeSettings from "./welcome-settings";
import { prisma } from "@/lib/prisma";
import { welcomeDefaults } from "@/lib/action-notifications";
import { hasPermission } from "@/lib/portal-permissions";
import NotificationRecords from './notification-records';

export default async function NotificationsManagementPage() {
  const admin = await requirePagePermission("notifications.view");
  const settings = await prisma.notificationSettings.findUnique({ where: { id: "GLOBAL" } }) ?? welcomeDefaults;
  const session = await auth();
  if (!session?.user) redirect("/");
  return <RoomManagementShell title="Notification Center"><WelcomeSettings initial={{welcomeEnabled:settings.welcomeEnabled,welcomeTitle:settings.welcomeTitle,welcomeBody:settings.welcomeBody,revision:settings.revision}} canManage={hasPermission(admin,"notifications.manage")}/><NotificationManager/><NotificationRecords canRetract={admin.role==='SUPER_ADMIN'}/></RoomManagementShell>;
}
