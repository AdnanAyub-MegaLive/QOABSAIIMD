import { requirePagePermission } from "@/lib/portal-admin";
import PortalSidebar from "../components/portal-sidebar";
import FeatureSearch from "../components/feature-search";
import StaffManager from "./staff-manager";
export const metadata = { title: "Accounts & Permissions | Mega Live Portal" };
export default async function Page() {
  await requirePagePermission("accounts.view");
  return <main className="[&_:is(button,a,input,select,textarea):focus-visible]:outline-2 [&_:is(button,a,input,select,textarea):focus-visible]:outline-[#16877d] [&_:is(button,a,input,select,textarea):focus-visible]:outline-offset-3 [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-55 [&_:is(input,select,textarea)]:accent-[#087f74] [&_input:not([type=checkbox]):not([type=radio])]:min-h-10 [&_select]:min-h-10 [&_table]:tabular-nums [&_th]:whitespace-nowrap [&_pre]:max-w-full min-h-screen bg-[#f4f8f7] text-[#142c2a]"><PortalSidebar /><section className="lg:pl-64"><header className="flex min-h-20 items-center gap-6 border-b border-[#dfe9e7] bg-white px-6 py-4 md:px-10"><div><p className="text-xs font-semibold uppercase tracking-widest text-[#16877d]">Administration</p><h1 className="text-xl font-bold">Accounts & Permissions</h1></div><FeatureSearch /></header><div className="mx-auto max-w-7xl p-6 md:p-10"><StaffManager /></div></section></main>;
}
