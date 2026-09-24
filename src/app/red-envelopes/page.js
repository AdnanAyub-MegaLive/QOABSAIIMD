import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import FeatureSearch from "../components/feature-search";
import PortalSidebar from "../components/portal-sidebar";
import { getRedEnvelopeConfiguration } from "@/lib/red-envelopes";
import RedEnvelopeManager from "./red-envelope-manager";

export default async function RedEnvelopesPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  const configuration = await getRedEnvelopeConfiguration({ includeInactive: true });
  return <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]"><PortalSidebar/><section className="lg:pl-64"><header className="flex h-20 items-center gap-6 border-b border-[#dfe9e7] bg-white px-6 md:px-10"><div className="shrink-0"><p className="text-xs font-semibold tracking-widest text-[#c94848] uppercase">Room Economy</p><h1 className="text-xl font-bold">Red Envelopes</h1></div><FeatureSearch/></header><div className="mx-auto max-w-7xl p-6 md:p-10"><div className="mb-7"><h2 className="text-2xl font-bold">Red Envelope controls</h2><p className="mt-1.5 text-sm text-[#71847f]">Manage the mobile presets, limits, countdown and claim lifetime. Changes are served to the application immediately.</p></div><RedEnvelopeManager initialConfiguration={configuration}/></div></section></main>;
}
