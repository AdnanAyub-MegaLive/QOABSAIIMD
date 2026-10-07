import Link from "next/link";
import { hasPermission } from "@/lib/portal-permissions";
import PortalSidebar from "./portal-sidebar";
import FeatureSearch from "./feature-search";
const tabs = [["sessions", "Live Sessions"], ["kyc", "Hosts & KYC"], ["gifts", "Gifts & Income"], ["rewards", "Live Rules & Rewards"], ["pk", "PK & Guests"]];
export default function LiveManagementShell({ active = "sessions", admin, children }) {
  return <main className="portal-shell min-h-screen bg-[#f4f8f7] text-[#142c2a]"><PortalSidebar /><section className="min-w-0 lg:pl-64"><header className="flex min-h-20 items-center gap-6 border-b border-[#dfe9e7] bg-white px-6 py-4 md:px-10"><div className="shrink-0"><p className="text-xs font-semibold uppercase tracking-widest text-[#16877d]">Live Management</p><h1 className="text-xl font-bold">Live Control Center</h1></div><FeatureSearch /></header><div className="mx-auto max-w-7xl p-6 md:p-10"><nav aria-label="Live management sections" className="mb-7 flex gap-1 overflow-x-auto border-b border-[#dce7e4]">{tabs.filter(([key]) => key === "kyc" ? hasPermission(admin, "hosts.view") : true).map(([key, label]) => <Link key={key} href={`/live-management?tab=${key}`} aria-current={active === key ? "page" : undefined} className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold ${active === key ? "border-[#087f74] text-[#087f74]" : "border-transparent text-[#71847f]"}`}>{label}</Link>)}</nav>{children}</div></section></main>;
}
