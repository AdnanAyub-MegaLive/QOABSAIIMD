import { requirePagePermission } from "@/lib/portal-admin";
import PortalSidebar from "../components/portal-sidebar";
import ProfileDisplayManager from "./profile-display-manager";
export default async function Page() {
  await requirePagePermission("users.edit");
  return <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]"><PortalSidebar/><section className="lg:pl-64"><div className="mx-auto max-w-7xl p-6 md:p-10"><ProfileDisplayManager /></div></section></main>;
}
