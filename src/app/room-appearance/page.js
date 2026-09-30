import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import PortalSidebar from "../components/portal-sidebar";
import FeatureSearch from "../components/feature-search";
import RoomAppearanceManager from "./room-appearance-manager";
import RoomManagementTabs from "../components/room-management-tabs";

export default async function RoomAppearancePage() {
  const session = await auth(); if (!session?.user) redirect("/");
  return <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]"><PortalSidebar/><section className="lg:pl-64"><header className="flex h-20 items-center gap-6 border-b border-[#dfe9e7] bg-white px-6 md:px-10"><div><p className="text-xs font-semibold tracking-widest text-[#c94848] uppercase">Room Management</p><h1 className="text-xl font-bold">Room Appearance</h1></div><FeatureSearch/></header><div className="mx-auto max-w-7xl p-6 md:p-10"><RoomManagementTabs/><RoomAppearanceManager/></div></section></main>;
}
