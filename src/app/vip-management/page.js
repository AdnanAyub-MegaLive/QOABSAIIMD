import { requirePagePermission } from "@/lib/portal-admin";
import { hasPermission } from "@/lib/portal-permissions";
import PortalSidebar from "../components/portal-sidebar";
import VipManager from "./vip-manager";
import { loadVipIdData } from "./id-data";
export default async function Page({searchParams}){
  const admin=await requirePagePermission("vip.view");
  const {tab}=await searchParams;
  const idData=hasPermission(admin,"users.view")?await loadVipIdData():null;
  return <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]"><PortalSidebar/><section className="lg:pl-64"><div className="mx-auto max-w-7xl p-6 md:p-10"><VipManager canDelete={admin.role==="SUPER_ADMIN"} initialTab={tab} idData={idData} canManageIds={hasPermission(admin,"users.specialIds")} canManage={hasPermission(admin,"vip.manage")} canUpload={hasPermission(admin,"uploads.manage")}/></div></section></main>;
}
