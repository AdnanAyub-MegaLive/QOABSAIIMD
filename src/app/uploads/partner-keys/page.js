import { requirePagePermission } from "@/lib/portal-admin";
import RoomManagementShell from "../../components/room-management-shell";
import PartnerKeyManager from "./partner-key-manager";

export default async function Page() {
  await requirePagePermission("uploads.manage");
  return <RoomManagementShell title="Partner store API keys"><PartnerKeyManager /></RoomManagementShell>;
}
