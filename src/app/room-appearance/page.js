import { requirePagePermission } from "@/lib/portal-admin";
import RoomManagementShell from "../components/room-management-shell";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import RoomAppearanceManager from "./room-appearance-manager";
export default async function RoomAppearancePage() {
  await requirePagePermission("appearance.view");
  const session = await auth(); if (!session?.user) redirect("/");
  return <RoomManagementShell title="Room Appearance"><RoomAppearanceManager/></RoomManagementShell>;
}
