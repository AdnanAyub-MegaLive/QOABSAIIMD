import { requirePagePermission } from "@/lib/portal-admin";
import RoomManagementShell from "../components/room-management-shell";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { getRedEnvelopeConfiguration } from "@/lib/red-envelopes";
import RedEnvelopeManager from "./red-envelope-manager";
export default async function RedEnvelopesPage() {
  await requirePagePermission("envelopes.view");
  const session = await auth();
  if (!session?.user) redirect("/");
  const configuration = await getRedEnvelopeConfiguration({ includeInactive: true });
  return <RoomManagementShell title="Red Envelopes"><div className="mb-7"><h2 className="text-2xl font-bold">Red Envelope controls</h2><p className="mt-1.5 text-sm text-[#71847f]">Manage the mobile presets, limits, countdown and claim lifetime. Changes are served to the application immediately.</p></div><RedEnvelopeManager initialConfiguration={configuration}/></RoomManagementShell>;
}
