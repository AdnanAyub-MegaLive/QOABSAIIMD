import Link from "next/link";
import { requirePagePermission } from "@/lib/portal-admin";
import { hasPermission } from "@/lib/portal-permissions";
import { prisma } from "@/lib/prisma";
import { announcementDefaults } from "@/lib/global-announcement-policy";
import Settings from "./settings";

export default async function Page() {
  const admin = await requirePagePermission("rules.view");
  const policy = await prisma.globalAnnouncementPolicy.findUnique({ where: { id: "GLOBAL" } });
  const initial = policy ? { rules: policy.rules, revision: policy.revision, cooldownSeconds: policy.cooldownSeconds, lifetimeSeconds: policy.lifetimeSeconds } : { ...announcementDefaults, revision: 0 };
  return <main className="min-h-screen bg-slate-50 p-6 text-slate-900"><div className="mx-auto max-w-3xl">
    <Link href="/platform-rules" className="text-teal-700">← Rules &amp; Profit Split</Link>
    <h1 className="mt-6 text-3xl font-bold">Global Announcements</h1>
    <p className="my-4 text-slate-600">Public audio-room activity only. These settings control banners, not payouts, Lucky odds or balances. Saving applies to future activity only.</p>
    <Settings initial={initial} canManage={hasPermission(admin, "rules.manage")} />
  </div></main>;
}
