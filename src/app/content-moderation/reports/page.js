import { requirePagePermission } from "@/lib/portal-admin";
import { hasPermission } from "@/lib/portal-permissions";
import RoomManagementShell from "@/app/components/room-management-shell";
import ReportQueue from "./report-queue";
export default async function ReportsPage() {
  const admin = await requirePagePermission("content.view");
  return <RoomManagementShell title="Safety Reports"><ReportQueue canReview={hasPermission(admin, "content.manage")}/></RoomManagementShell>;
}
