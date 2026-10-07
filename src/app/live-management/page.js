import Link from "next/link";
import { requirePagePermission } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import LiveManagementShell from "../components/live-management-shell";
import LiveVideoManager from "../live-video-management/live-video-manager";
import LiveCommerceManager from "./live-commerce-manager";
import { hasPermission } from "@/lib/portal-permissions";
const card = "rounded-2xl border border-[#dfe9e7] bg-white p-6";
const link = "inline-block mt-4 rounded-lg bg-[#16877d] px-4 py-2 text-sm font-semibold text-white";
export default async function LiveManagementPage({ searchParams }) {
  const admin = await requirePagePermission("video.view");
  const requested = (await searchParams).tab;
  const tab = ["kyc", "gifts", "rewards", "pk"].includes(requested) ? requested : "sessions";
  let content;
  if (tab === "kyc") {
    await requirePagePermission("hosts.view");
    const hosts = await prisma.user.findMany({ where: { deletedAt: null, appRoles: { has: "HOST" } }, select: { publicId: true, name: true, status: true, isVerified: true }, orderBy: { updatedAt: "desc" }, take: 200 });
    content = <section className={card}><h2 className="text-xl font-bold">Host eligibility & KYC</h2><p className="mt-2 text-sm text-[#71847f]">KYC approval is mandatory. Only active Host accounts with approved account verification can start or obtain host publishing access. The existing verification flag is the current approval source.</p><Link className={link} href="/talents">Manage host approvals</Link><div className="mt-6 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-3">Host</th><th>ID</th><th>Account</th><th>Go Live eligibility</th></tr></thead><tbody>{hosts.map(h => <tr key={h.publicId} className="border-t border-[#e3ece9]"><td className="py-4">{h.name}</td><td>{h.publicId}</td><td>{h.status}</td><td>{h.status === "ACTIVE" && h.isVerified ? "Eligible" : h.isVerified ? "Account restricted" : "KYC required"}</td></tr>)}</tbody></table>{!hosts.length && <p className="py-6 text-sm">No hosts found.</p>}</div></section>;
  } else if (tab === "rewards" || tab === "gifts") {
    content = <LiveCommerceManager mode={tab} canManage={hasPermission(admin, "video.manage")} />;
  } else {
    content = <>{tab === "pk" && <section className={`${card} mb-6`}><h2 className="text-xl font-bold">PK & guest operations</h2><p className="mt-2 text-sm text-[#71847f]">Session cards show active PK opponents, guest approvals and moderation reports.</p></section>}<LiveVideoManager /></>;
  }
  return <LiveManagementShell active={tab} admin={admin}>{content}</LiveManagementShell>;
}
