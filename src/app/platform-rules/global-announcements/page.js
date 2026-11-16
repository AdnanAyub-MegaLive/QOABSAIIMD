import PortalSidebar from "../../components/portal-sidebar";
import Link from "next/link";
import { requirePagePermission } from "@/lib/portal-admin";
import { hasPermission } from "@/lib/portal-permissions";
import { prisma } from "@/lib/prisma";
import { effectiveAnnouncementPolicy } from "@/lib/global-announcement-policy";
import Settings from "./settings";

export default async function Page() {
  const admin = await requirePagePermission("rules.view");
  const policy = await prisma.globalAnnouncementPolicy.findUnique({ where: { id: "GLOBAL" } });
  return <main className="portal-ui min-h-screen bg-slate-50 text-slate-900"><PortalSidebar/><section id="portal-content" tabIndex={-1} className="lg:pl-64"><div className="mx-auto max-w-4xl p-6 md:p-10">
    <Link href="/platform-rules" className="text-teal-700">← Rules &amp; Profit Split</Link>
    <h1 className="mt-6 text-3xl font-bold">Global Announcements</h1>
    <p className="my-4 text-slate-600">Public audio-room activity only. These settings control banners, not payouts, Lucky odds or balances. Saving applies to future activity only.</p>
    <Settings initial={effectiveAnnouncementPolicy(policy)} canManage={hasPermission(admin, "rules.edit")} />
  </div></section></main>;
}
