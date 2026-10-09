import { requirePagePermission } from "@/lib/portal-admin";
import { hasPermission } from "@/lib/portal-permissions";
import PortalSidebar from "../components/portal-sidebar";
import VipManager from "./vip-manager";
export default async function Page(){
  const admin=await requirePagePermission("vip.view");
  return <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]"><PortalSidebar/><section className="lg:pl-64"><div className="mx-auto max-w-7xl p-6 md:p-10"><VipManager canManage={hasPermission(admin,"vip.manage")} canUpload={hasPermission(admin,"uploads.manage")}/></div></section></main>;
}
