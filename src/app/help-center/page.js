import { requirePagePermission } from "@/lib/portal-admin";
import RoomManagementShell from "../components/room-management-shell";
import HelpCenterEditor from "./help-center-editor";
export default async function HelpCenterPage() {
  await requirePagePermission("help_center.manage");
  return <RoomManagementShell title="Help Center"><HelpCenterEditor /></RoomManagementShell>;
}
