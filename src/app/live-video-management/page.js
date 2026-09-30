import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import PortalSidebar from "../components/portal-sidebar";
import FeatureSearch from "../components/feature-search";
import RoomManagementTabs from "../components/room-management-tabs";
import LiveVideoManager from "./live-video-manager";

export default async function LiveVideoManagementPage(){const session=await auth();if(!session?.user)redirect("/");return <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]"><PortalSidebar/><section className="lg:pl-64"><header className="flex h-20 items-center gap-6 border-b border-[#dfe9e7] bg-white px-6 md:px-10"><div><p className="text-xs font-semibold uppercase tracking-widest text-[#c94848]">Room Management</p><h1 className="text-xl font-bold">Live Video Management</h1></div><FeatureSearch/></header><div className="mx-auto max-w-7xl p-6 md:p-10"><RoomManagementTabs/><LiveVideoManager/></div></section></main>}
